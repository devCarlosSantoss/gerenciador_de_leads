import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { SiteAuditService } from "../siteaudit/site-audit.service";
import { ScoringService } from "../scoring/scoring.service";
import { ContactLifecycleService } from "../contact/contact-lifecycle.service";
import { llmAnalysisSchema, type LlmAnalysis } from "./analysis.schemas";
import { FindingsService, type FindingPersistInput } from "./findings.service";
import { buildDeterministicFindings } from "./deterministic-facts";

const PROMPT_VERSION = "structured-v1";

const SYSTEM_PROMPT = `Você é um analista comercial B2B da Aurora Code Tech, que cria sites,
landing pages, lojas virtuais, sistemas sob medida, integrações de pagamento e automações
para pequenas e médias empresas no Brasil.

Analise a empresa SOMENTE com base nos dados fornecidos (dados do lead, do site, da
auditoria técnica e dos fatos determinísticos). NÃO invente nada.

Divida a análise em:
- "facts": afirmações verificáveis, CADA UMA com ao menos uma evidência concreta (url,
  texto extraído ou métrica). Para os fatos determinísticos fornecidos, REUTILIZE o mesmo
  "id" que recebeu e a evidência correspondente.
- "inferences": interpretações razoáveis e úteis para vendas, com "confidence" (0..1) e
  SEMPRE com "sourceType": "AI_INFERENCE". Nunca apresente inferência como fato.
- "unknowns": o que NÃO é possível determinar com os dados disponíveis.
- "opportunities": recomendações de serviço baseadas nos fatos (use "evidenceFindingIds"
  apontando para os ids dos facts/inferences que as sustentam).
- "risks": riscos e limitações evidentes (ex.: site inacessível, sem contato, dados antigos).
- "message_eligible_findings": ids de facts/inferences CONFIÁVEIS (com evidência) que podem
  personalizar mensagens de primeiro contato. Apenas o que for verificável.
- "requires_human_review": true se os dados forem insuficientes, houver incerteza material
  ou alguma inferência importante tiver confiança baixa.

REGRAS:
- Nunca afirme que o site "está perdendo vendas" sem métrica de conversão.
- Nunca invente nome de proprietário, métricas ou problemas não evidenciados.
- Nunca critique a empresa de forma ofensiva.
- Inferência NUNCA pode usar sourceType determinístico (WEBSITE_HTTP, HTML_ANALYSIS,
  LIGHTHOUSE, PAGESPEED, DNS, SOCIAL_PUBLIC, USER_INPUT) — use "AI_INFERENCE".
- Fatos determinísticos fornecidos não devem ser contraditos; se houver contradição entre
  dois fatos, registre valores diferentes (o conflito será detectado automaticamente).
- Mensagens NUNCA são geradas a partir de texto livre: apenas a partir de
  message_eligible_findings.

FORMATO DE SAÍDA — retorne APENAS um JSON válido, SEM markdown e SEM campos extras:
{
  "facts": [{
    "id": "string", "category": "fact", "claim": "string", "value": "string|number|boolean",
    "valueType": "string|number|boolean|url|metric", "sourceType": "WEBSITE_HTTP|HTML_ANALYSIS|LIGHTHOUSE|PAGESPEED|DNS|SOCIAL_PUBLIC|USER_INPUT",
    "confidence": 0, "evidence": [{ "sourceType": "...", "url": "string", "evidenceType": "html_element|text|metric|screenshot|external_doc|user_input", "selector": "string", "extractedText": "string", "metricName": "string", "metricValue": 0 }]
  }],
  "inferences": [{
    "id": "string", "category": "inference", "claim": "string", "value": "string|number|boolean",
    "valueType": "string|number|boolean|url|metric", "sourceType": "AI_INFERENCE", "confidence": 0.7,
    "evidence": [{ "sourceType": "AI_INFERENCE", "evidenceType": "text", "extractedText": "string" }]
  }],
  "unknowns": [{ "id": "string", "category": "unknown", "claim": "string", "valueType": "string", "sourceType": "AI_INFERENCE", "confidence": 0, "evidence": [] }],
  "opportunities": [{ "title": "string", "description": "string", "confidence": 0, "priority": "high|medium|low", "evidenceFindingIds": ["id"] }],
  "risks": [{ "id": "string", "category": "risk", "claim": "string", "valueType": "string", "sourceType": "AI_INFERENCE", "confidence": 0, "evidence": [] }],
  "message_eligible_findings": ["id"],
  "requires_human_review": false
}`;

interface AnalysisLead {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  rating: number | null;
  reviewsCount: number | null;
  websiteStatus: string;
  contacts: Array<{ type: string; isValid: boolean; isVerified: boolean }>;
  websites: Array<{ id: string; url: string; status: string; audits: Array<{ metrics: unknown; checks: unknown }> }>;
  socialProfiles: Array<{ platform: string; handle: string }>;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly siteAudit: SiteAuditService,
    private readonly scoring: ScoringService,
    private readonly lifecycle: ContactLifecycleService,
    private readonly findings: FindingsService,
  ) {}

  async begin(leadId: string): Promise<void> {
    const running = await this.prisma.analysisRun.updateMany({
      where: { leadId, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    if (running.count === 0) {
      await this.prisma.analysisRun.create({
        data: {
          leadId,
          provider: "pending",
          model: "pending",
          promptVersion: PROMPT_VERSION,
          inputSnapshot: {},
          output: {},
          status: "RUNNING",
          startedAt: new Date(),
        },
      });
    }
    this.logger.log(`Análise INICIADA — lead ${leadId}`);
    await this.lifecycle.transition(leadId, "ANALYZING", { actorType: "worker" });
  }

  async analyze(leadId: string): Promise<void> {
    const lead = (await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      include: {
        contacts: true,
        websites: { include: { audits: { orderBy: { auditedAt: "desc" }, take: 1 } } },
        socialProfiles: true,
      },
    })) as AnalysisLead | null;
    if (!lead) throw new Error(`Lead ${leadId} não encontrado`);

    const website = lead.websites[0];
    if (website) {
      const hasAudit = await this.prisma.websiteAudit.findFirst({
        where: { websiteId: website.id },
      });
      if (!hasAudit) {
        this.logger.log(`Auditoria de site em andamento para ${lead.name}...`);
        try {
          await this.siteAudit.audit(website.id);
          this.logger.log(`Auditoria de site OK para ${lead.name}`);
        } catch (err) {
          this.logger.warn(`Auditoria de site falhou: ${(err as Error).message}`);
        }
      }
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: "ANALYZING" },
    });

    const deterministicFindings = this.buildDeterministic(lead);
    const input = this.buildInput(lead, deterministicFindings);
    const provider = this.ai.provider;
    const { provider: providerName, model } = this.splitProviderName(provider.name);

    let output: LlmAnalysis;
    const t0 = Date.now();
    const startedAt = new Date(t0);
    try {
      this.logger.log(`Chamada à IA (${provider.name}) para ${lead.name}...`);
      const res = await provider.generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: input,
        schema: llmAnalysisSchema,
        temperature: 0.2,
      });
      output = res.value;
      this.logger.log(
        `IA respondeu em ${Date.now() - t0}ms (${provider.name}) para ${lead.name}`,
      );
    } catch (err) {
      const message = (err as Error).message;
      await this.markFailed(leadId, message);
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { status: "ERROR" },
      });
      await this.lifecycle.transition(leadId, "ERROR", { actorType: "worker" });
      this.logger.error(`Análise FALHOU para ${lead.name}: ${message}`);
      throw err;
    }

    const finishedAt = new Date();
    const result = await this.findings.persistStructuredAnalysis(leadId, {
      provider: providerName,
      model,
      promptVersion: PROMPT_VERSION,
      output,
      deterministicFindings,
      inputSnapshot: this.safeSnapshot(lead) as unknown as Prisma.InputJsonValue,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - t0),
    });

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        websiteStatus: this.mapWebsiteStatus(output.website_status, website?.status) as never,
        status: "ANALYZED",
      },
    });
    await this.lifecycle.transition(leadId, "ANALYZED", { actorType: "worker" });
    this.logger.log(
      `Análise CONCLUÍDA para ${lead.name} (status=${result.status}, findings=${result.findingsCount})`,
    );

    try {
      await this.scoring.computeFor(leadId);
    } catch (err) {
      this.logger.warn(`Falha ao calcular score: ${(err as Error).message}`);
    }
  }

  private buildDeterministic(lead: AnalysisLead): FindingPersistInput[] {
    const website = lead.websites[0];
    const audit = website?.audits?.[0];
    const metrics = (audit?.metrics ?? {}) as Record<string, unknown>;
    const checks = (audit?.checks ?? {}) as Record<string, unknown>;
    const dnsOk = (checks["dns"] as { ok?: boolean } | undefined)?.ok;
    const httpStatus = metrics["httpStatus"] as number | undefined;
    const pageSpeedMetrics = (metrics["pageSpeed"] ?? {}) as Record<string, unknown>;
    const pageSpeedChecks = (checks["pageSpeed"] ?? {}) as Record<string, unknown>;

    return buildDeterministicFindings({
      websiteUrl: website?.url,
      dnsOk,
      httpStatus,
      checks: checks as Record<string, unknown>,
      metrics: metrics as Record<string, unknown>,
      pageSpeedMetrics,
      pageSpeedChecks,
      websiteExists: Boolean(website),
      websiteStatus: lead.websiteStatus,
      hasWhatsappContact: lead.contacts.some((c) => c.type === "WHATSAPP" && c.isValid),
      hasValidContact: lead.contacts.some((c) => c.isValid),
      socialProfiles: lead.socialProfiles,
      reviewsCount: lead.reviewsCount,
      rating: lead.rating,
    });
  }

  private async markFailed(leadId: string, error: string): Promise<void> {
    const running = await this.prisma.analysisRun.findFirst({
      where: { leadId, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
    });
    const startedAt = running?.startedAt ?? new Date();
    const now = new Date();
    await this.prisma.analysisRun.updateMany({
      where: { leadId, status: "RUNNING" },
      data: {
        status: "FAILED",
        error,
        output: { error },
        finishedAt: now,
        durationMs: Math.max(0, now.getTime() - startedAt.getTime()),
      },
    });
  }

  private splitProviderName(name: string): { provider: string; model: string } {
    const idx = name.indexOf(":");
    if (idx === -1) return { provider: name, model: "unknown" };
    return { provider: name.slice(0, idx), model: name.slice(idx + 1) };
  }

  private buildInput(lead: AnalysisLead, deterministicFindings: FindingPersistInput[]): string {
    const website = lead.websites[0];
    const audits = website?.audits?.[0];
    return JSON.stringify(
      {
        company: {
          name: lead.name,
          category: lead.category,
          address: lead.address,
          city: lead.city,
          state: lead.state,
          rating: lead.rating,
          reviews_count: lead.reviewsCount,
        },
        website: website
          ? { url: website.url, status: website.status, audit: audits ?? null }
          : null,
        deterministic_facts: deterministicFindings.map((d) => ({
          id: d.id,
          claim: d.claim,
          value: d.value,
          valueType: d.valueType,
          source_type: d.sourceType,
          evidence: d.evidence.map((e) => ({
            url: e.url,
            extracted_text: e.extractedText,
            metric_name: e.metricName,
            metric_value: e.metricValue,
          })),
        })),
        social_profiles: lead.socialProfiles.map((s) => `${s.platform}:${s.handle}`),
        contacts_available: lead.contacts.map((c) => `${c.type}:${c.isValid ? "valid" : "invalid"}`),
      },
      null,
      2,
    );
  }

  private safeSnapshot(lead: AnalysisLead): Record<string, string | null> {
    return { name: lead.name, category: lead.category, city: lead.city, state: lead.state };
  }

  private mapWebsiteStatus(
    status: LlmAnalysis["website_status"],
    auditStatus: string | undefined,
  ): string {
    if (!status) return auditStatus ?? "UNKNOWN";
    return status === "no_website"
      ? "NO_WEBSITE"
      : status === "active"
        ? "ACTIVE"
        : status === "unreachable"
          ? "UNREACHABLE"
          : status === "parked"
            ? "PARKED"
            : "UNKNOWN";
  }
}