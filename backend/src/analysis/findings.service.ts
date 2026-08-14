import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  MESSAGE_CONFIDENCE_THRESHOLD,
  isDeterministicSource,
  type FindingCategory,
  type FindingValueType,
  type EvidenceSourceType,
  type EvidenceType,
  type AnalysisRunView,
  type FindingView,
  type EvidenceView,
  type RecommendationView,
  type ConflictView,
} from "../shared/analysis";
import { cleanEvidenceText, hashEvidence, EVIDENCE_SELECTOR_MAX } from "./evidence-sanitizer";
import type { LlmAnalysis, StructuredAnalysis } from "./analysis.schemas";

export interface EvidencePersistInput {
  url?: string;
  evidenceType: EvidenceType;
  sourceType: EvidenceSourceType;
  selector?: string;
  extractedText?: string;
  metricName?: string;
  metricValue?: number;
  screenshotReference?: string;
}

export interface FindingPersistInput {
  id: string;
  category: FindingCategory;
  claim: string;
  value: unknown;
  valueType: FindingValueType;
  sourceType: EvidenceSourceType;
  confidence?: number;
  evidence: EvidencePersistInput[];
}

export interface PersistStructuredInput {
  provider: string;
  model: string;
  promptVersion: string;
  output: LlmAnalysis;
  deterministicFindings: FindingPersistInput[];
  inputSnapshot: Prisma.InputJsonValue;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

interface EvaluatedFinding {
  requiresHumanReview: boolean;
  messageEligible: boolean;
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function valueKey(v: unknown): string {
  if (typeof v === "number") return `n:${v}`;
  if (typeof v === "boolean") return `b:${v}`;
  return `s:${String(v ?? "")}`;
}

/**
 * Validação de negócio de um finding produzido pela IA:
 * - Fato sem evidência suficiente → requer revisão humana, não elegível.
 * - Inferência com confiança abaixo do limiar → requer revisão humana.
 * - Inferência marcada como fato → nunca elegível.
 * - Apenas findings de fato/inferência listados em `message_eligible_findings`
 *   (e que passem nas regras) podem personalizar mensagens.
 */
export function evaluateFinding(
  f: { category: FindingCategory; sourceType: EvidenceSourceType; confidence?: number; evidence: EvidencePersistInput[] },
  listedEligible: boolean,
): EvaluatedFinding {
  let requiresHumanReview = false;
  let messageEligible = false;

  if (f.category === "INFERENCE") {
    const confidenceOk = typeof f.confidence === "number" && f.confidence >= MESSAGE_CONFIDENCE_THRESHOLD;
    if (!confidenceOk) requiresHumanReview = true;
    if (f.sourceType !== "AI_INFERENCE") {
      // inferência apresentada como fato determinístico — insegura
      requiresHumanReview = true;
    }
    messageEligible = listedEligible && confidenceOk && f.evidence.length > 0;
  }

  if (f.category === "FACT") {
    const strongEvidence = f.evidence.some(
      (e) => e.url || (e.extractedText && e.extractedText.length > 0) || typeof e.metricValue === "number",
    );
    if (!strongEvidence || f.evidence.length === 0) requiresHumanReview = true;
    if (!isDeterministicSource(f.sourceType)) requiresHumanReview = true;
    messageEligible = listedEligible && strongEvidence && isDeterministicSource(f.sourceType);
  }

  return { requiresHumanReview, messageEligible };
}

/** Detecta conflitos entre findings do mesmo run (mesmo tema, valores divergentes). */
export function detectConflicts(findings: Array<{ id: string; category: FindingCategory; claim: string; value: unknown }>) {
  const byKey = new Map<string, typeof findings>();
  for (const f of findings) {
    const key = normalizeKey(f.claim);
    if (!key) continue;
    const bucket = byKey.get(key) ?? [];
    bucket.push(f);
    byKey.set(key, bucket);
  }

  const conflicts: Array<{ fromFindingId: string; toFindingId: string; nature: string; resolution?: string }> = [];
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const distinct = new Set(group.map((f) => valueKey(f.value)));
    if (distinct.size < 2) continue;

    const hasFact = group.some((f) => f.category === "FACT");
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (valueKey(a.value) === valueKey(b.value)) continue;
        const nature = a.category === "FACT" || b.category === "FACT" ? "contradiction" : "inconsistency";
        conflicts.push({
          fromFindingId: a.id,
          toFindingId: b.id,
          nature,
          resolution: hasFact ? "resolvido a favor do fato (fato tem precedência)" : undefined,
        });
      }
    }
  }
  return conflicts;
}

@Injectable()
export class FindingsService {
  private readonly logger = new Logger(FindingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persiste a análise estruturada de forma transacional: atualiza o run,
   * cria findings (determinísticos + da IA), evidências sanitizadas com hash,
   * recomendações e conflitos. Nunca sobrescreve runs anteriores.
   */
  async persistStructuredAnalysis(
    orgId: string,
    companyId: string,
    input: PersistStructuredInput,
  ): Promise<{ runId: string; findingsCount: number; requiresHumanReview: boolean; status: string }> {
    const output = input.output;
    const structured: StructuredAnalysis = output; // o contrato obrigatório está presente no tipo LlmAnalysis

    const listedEligible = new Set(output.message_eligible_findings);

    const facts: FindingPersistInput[] = input.deterministicFindings.map((d) => ({
      ...d,
      category: "FACT",
    }));
    const llmFacts = output.facts.map((f) => this.toPersistFinding(f, "FACT"));
    const inferences = output.inferences.map((f) => this.toPersistFinding(f, "INFERENCE"));
    const unknowns = output.unknowns.map((f) => this.toPersistFinding(f, "UNKNOWN"));
    const risks = output.risks.map((f) => this.toPersistFinding(f, "RISK"));

    const allFindings = [...facts, ...llmFacts, ...inferences, ...unknowns, ...risks];

    const evaluated = new Map<string, EvaluatedFinding>();
    for (const f of allFindings) {
      evaluated.set(f.id, evaluateFinding(f, listedEligible.has(f.id)));
    }

    const requiresHumanReview =
      output.requires_human_review ||
      output.unknowns.length > 0 ||
      allFindings.some((f) => evaluated.get(f.id)?.requiresHumanReview);

    const status: "COMPLETED" | "NEEDS_HUMAN_REVIEW" | "PARTIAL" =
      output.requires_human_review ? "NEEDS_HUMAN_REVIEW"
      : requiresHumanReview ? "PARTIAL"
      : "COMPLETED";

    return this.prisma.$transaction(async (tx) => {
      const run =
        (await tx.analysisRun.findFirst({
          where: { companyId, status: "RUNNING" },
          orderBy: { createdAt: "desc" },
        })) ??
        (await tx.analysisRun.create({
          data: {
            organizationId: orgId,
            companyId,
            provider: input.provider,
            model: input.model,
            promptVersion: input.promptVersion,
            status: "RUNNING",
            inputSnapshot: input.inputSnapshot,
            output: {},
            startedAt: input.startedAt,
          },
        }));

      await tx.analysisRun.update({
        where: { id: run.id },
        data: {
          provider: input.provider,
          model: input.model,
          promptVersion: input.promptVersion,
          status,
          requiresHumanReview,
          inputSnapshot: input.inputSnapshot,
          output: output as unknown as Prisma.InputJsonValue,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          durationMs: input.durationMs,
        },
      });

      const findingIds = new Map<string, string>();
      for (const f of allFindings) {
        const created = await tx.analysisFinding.create({
          data: {
            organizationId: orgId,
            leadId: companyId,
            analysisRunId: run.id,
            category: f.category,
            claim: f.claim.slice(0, 500),
            value: (f.value === undefined ? undefined : f.value) as Prisma.InputJsonValue | undefined,
            valueType: f.valueType,
            sourceType: f.sourceType,
            confidence: f.confidence ?? null,
            requiresHumanReview: evaluated.get(f.id)?.requiresHumanReview ?? false,
            messageEligible: evaluated.get(f.id)?.messageEligible ?? false,
          },
        });
        findingIds.set(f.id, created.id);

        for (const ev of f.evidence) {
          const extractedText = cleanEvidenceText(ev.extractedText);
          await tx.analysisEvidence.create({
            data: {
              organizationId: orgId,
              findingId: created.id,
              url: ev.url?.slice(0, 2048) ?? null,
              evidenceType: ev.evidenceType,
              sourceType: ev.sourceType,
              selector: ev.selector ? cleanEvidenceText(ev.selector, EVIDENCE_SELECTOR_MAX) : null,
              extractedText: extractedText || null,
              metricName: ev.metricName ? cleanEvidenceText(ev.metricName, 120) : null,
              metricValue: ev.metricValue ?? null,
              screenshotReference: ev.screenshotReference?.slice(0, 500) ?? null,
              hash: hashEvidence({
                url: ev.url,
                extractedText,
                metricName: ev.metricName,
                metricValue: ev.metricValue,
                selector: ev.selector,
              }),
            },
          });
        }
      }

      for (const op of output.opportunities) {
        await tx.analysisRecommendation.create({
          data: {
            organizationId: orgId,
            leadId: companyId,
            analysisRunId: run.id,
            kind: "opportunity",
            title: op.title.slice(0, 300),
            description: op.description?.slice(0, 1000) ?? null,
            confidence: op.confidence ?? null,
            priority: op.priority ?? null,
            requiresHumanReview,
          },
        });
      }

      const conflicts = detectConflicts(
        allFindings.map((f) => ({ id: f.id, category: f.category, claim: f.claim, value: f.value })),
      );
      for (const c of conflicts) {
        await tx.analysisConflict.create({
          data: {
            organizationId: orgId,
            analysisRunId: run.id,
            fromFindingId: findingIds.get(c.fromFindingId) ?? run.id,
            toFindingId: findingIds.get(c.toFindingId) ?? run.id,
            nature: c.nature,
            resolution: c.resolution ?? null,
          },
        });
      }

      return {
        runId: run.id,
        findingsCount: allFindings.length,
        requiresHumanReview,
        status,
      };
    });
  }

  /** Converte um finding do contrato da IA (camelCase) para persistência. */
  private toPersistFinding(
    f: StructuredAnalysis["facts"][number],
    category: FindingCategory,
  ): FindingPersistInput {
    return {
      id: f.id,
      category,
      claim: f.claim,
      value: f.value,
      valueType: this.mapValueType(f.valueType, f.value),
      sourceType: f.sourceType,
      confidence: f.confidence,
      evidence: f.evidence.map((e) => ({
        url: e.url,
        evidenceType: this.mapEvidenceType(e.evidenceType),
        sourceType: e.sourceType,
        selector: e.selector,
        extractedText: e.extractedText,
        metricName: e.metricName,
        metricValue: e.metricValue,
        screenshotReference: e.screenshotReference,
      })),
    };
  }

  private mapValueType(vt: string, value: unknown): FindingValueType {
    if (typeof value === "boolean") return "BOOLEAN";
    if (typeof value === "number") return "NUMBER";
    if (vt === "url") return "URL";
    if (vt === "metric") return "METRIC";
    return "STRING";
  }

  private mapEvidenceType(et: string): EvidenceType {
    const map: Record<string, EvidenceType> = {
      html_element: "HTML_ELEMENT",
      text: "TEXT",
      metric: "METRIC",
      screenshot: "SCREENSHOT",
      external_doc: "EXTERNAL_DOC",
      user_input: "USER_INPUT",
    };
    return map[et] ?? "TEXT";
  }

  /**
   * Findings aprovados para personalizar mensagens (filtro de evidências
   * permitidas). Só fatos/inferências com evidência, sem revisão humana
   * obrigatória e com confiança suficiente entram aqui.
   */
  async getEligibleFindings(orgId: string, companyId: string): Promise<FindingView[]> {
    const run = await this.prisma.analysisRun.findFirst({
      where: { companyId, organizationId: orgId, status: { not: "FAILED" } },
      orderBy: { createdAt: "desc" },
    });
    if (!run) return [];

    const findings = await this.prisma.analysisFinding.findMany({
      where: {
        leadId: companyId,
        analysisRunId: run.id,
        messageEligible: true,
        requiresHumanReview: false,
        category: { in: ["FACT", "INFERENCE"] },
      },
      include: { evidence: true },
      orderBy: { createdAt: "asc" },
    });

    return findings.map((f) => this.toView(f));
  }

  /** Visão completa do run + findings + evidências + recomendações + conflitos. */
  async getRunView(orgId: string, companyId: string, runId?: string): Promise<AnalysisRunView | null> {
    const run = await this.prisma.analysisRun.findFirst({
      where: {
        companyId,
        organizationId: orgId,
        ...(runId ? { id: runId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        findings: { include: { evidence: true }, orderBy: { createdAt: "asc" } },
        recommendations: { orderBy: { createdAt: "asc" } },
        conflicts: {
          include: {
            fromFinding: { select: { id: true, claim: true } },
            toFinding: { select: { id: true, claim: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!run) return null;

    const findings: FindingView[] = run.findings.map((f) => this.toView(f));
    const recommendations: RecommendationView[] = run.recommendations.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      description: r.description,
      confidence: r.confidence,
      priority: r.priority,
      requiresHumanReview: r.requiresHumanReview,
      createdAt: r.createdAt.toISOString(),
    }));
    const conflicts: ConflictView[] = run.conflicts.map((c) => ({
      id: c.id,
      nature: c.nature,
      resolution: c.resolution,
      from: c.fromFinding,
      to: c.toFinding,
      createdAt: c.createdAt.toISOString(),
    }));

    return {
      id: run.id,
      provider: run.provider,
      model: run.model,
      promptVersion: run.promptVersion,
      status: run.status,
      requiresHumanReview: run.requiresHumanReview,
      error: run.error,
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      durationMs: run.durationMs,
      createdAt: run.createdAt.toISOString(),
      output: (run.output ?? null) as Record<string, unknown> | null,
      findings,
      recommendations,
      conflicts,
    };
  }

  private toView(f: {
    id: string;
    category: FindingCategory;
    claim: string;
    value: unknown;
    valueType: FindingValueType;
    sourceType: EvidenceSourceType;
    confidence: number | null;
    requiresHumanReview: boolean;
    messageEligible: boolean;
    createdAt: Date;
    evidence: Array<{
      id: string;
      url: string | null;
      evidenceType: EvidenceType;
      sourceType: EvidenceSourceType;
      selector: string | null;
      extractedText: string | null;
      metricName: string | null;
      metricValue: number | null;
      screenshotReference: string | null;
      collectedAt: Date;
      hash: string;
    }>;
  }): FindingView {
    const evidence: EvidenceView[] = f.evidence.map((e) => ({
      id: e.id,
      url: e.url,
      evidenceType: e.evidenceType,
      sourceType: e.sourceType,
      selector: e.selector,
      extractedText: e.extractedText,
      metricName: e.metricName,
      metricValue: e.metricValue,
      screenshotReference: e.screenshotReference,
      collectedAt: e.collectedAt.toISOString(),
      hash: e.hash,
    }));
    return {
      id: f.id,
      category: f.category,
      claim: f.claim,
      value: f.value,
      valueType: f.valueType,
      sourceType: f.sourceType,
      confidence: f.confidence,
      requiresHumanReview: f.requiresHumanReview,
      messageEligible: f.messageEligible,
      createdAt: f.createdAt.toISOString(),
      evidence,
    };
  }
}