import { describe, expect, it, beforeEach } from "vitest";
import { FindingsService } from "../src/analysis/findings.service";
import type { PrismaService } from "../src/prisma/prisma.service";

type AnyRecord = Record<string, unknown>;

function matchRecord(record: AnyRecord, where: AnyRecord): boolean {
  for (const [key, value] of Object.entries(where ?? {})) {
    if (Array.isArray(value)) continue;
    if (record[key] !== value) return false;
  }
  return true;
}

class MockPrisma {
  runs: AnyRecord[] = [];
  findings: AnyRecord[] = [];
  evidence: AnyRecord[] = [];
  recommendations: AnyRecord[] = [];
  conflicts: AnyRecord[] = [];
  private seq = 0;

  analysisRun = {
    findFirst: async ({ where }: { where: AnyRecord }) =>
      this.runs
        .filter((r) => matchRecord(r, where))
        .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))[0] ?? null,
    create: async ({ data }: { data: AnyRecord }) => {
      const r = { id: `run${++this.seq}`, createdAt: new Date(), ...data };
      this.runs.push(r);
      return r;
    },
    update: async ({ where, data }: { where: AnyRecord; data: AnyRecord }) => {
      const r = this.runs.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    },
  };

  analysisFinding = {
    create: async ({ data }: { data: AnyRecord }) => {
      const f = { id: `finding${++this.seq}`, createdAt: new Date(), ...data };
      this.findings.push(f);
      return f;
    },
  };

  analysisEvidence = {
    create: async ({ data }: { data: AnyRecord }) => {
      const e = { id: `evidence${++this.seq}`, ...data };
      this.evidence.push(e);
      return e;
    },
  };

  analysisRecommendation = {
    create: async ({ data }: { data: AnyRecord }) => {
      const r = { id: `rec${++this.seq}`, ...data };
      this.recommendations.push(r);
      return r;
    },
  };

  analysisConflict = {
    create: async ({ data }: { data: AnyRecord }) => {
      const c = { id: `conflict${++this.seq}`, ...data };
      this.conflicts.push(c);
      return c;
    },
  };

  $transaction = async <T>(fn: (tx: MockPrisma) => Promise<T>): Promise<T> => fn(this);
}

function serviceFor(mock: MockPrisma): FindingsService {
  return new FindingsService(mock as unknown as PrismaService);
}

function baseInput() {
  return {
    provider: "gemini",
    model: "gemini-2.0-flash",
    promptVersion: "structured-v1",
    inputSnapshot: {},
    startedAt: new Date("2026-08-14T10:00:00Z"),
    finishedAt: new Date("2026-08-14T10:01:00Z"),
    durationMs: 60_000,
    deterministicFindings: [
      {
        id: "contact.whatsapp.available",
        category: "FACT",
        claim: "O lead possui número de WhatsApp válido",
        value: true,
        valueType: "BOOLEAN",
        sourceType: "USER_INPUT",
        evidence: [
          {
            sourceType: "USER_INPUT",
            evidenceType: "USER_INPUT",
            extractedText: "<b>Contato</b> contato@loja.com",
          },
        ],
      },
    ],
    output: {
      facts: [
        {
          id: "html.https",
          category: "fact",
          claim: "O site está acessível via HTTPS",
          value: true,
          valueType: "boolean",
          sourceType: "HTML_ANALYSIS",
          evidence: [{ sourceType: "HTML_ANALYSIS", evidenceType: "metric", url: "https://exemplo.com", metricName: "https", metricValue: 1 }],
        },
      ],
      inferences: [
        {
          id: "inf.1",
          category: "inference",
          claim: "Pode se beneficiar de catálogo online",
          value: "provável",
          valueType: "string",
          sourceType: "AI_INFERENCE",
          confidence: 0.9,
          evidence: [{ sourceType: "AI_INFERENCE", evidenceType: "text", extractedText: "Sem catálogo" }],
        },
      ],
      unknowns: [],
      opportunities: [{ title: "Criar catálogo online", confidence: 0.7, priority: "high", evidenceFindingIds: ["inf.1"] }],
      risks: [],
      message_eligible_findings: ["contact.whatsapp.available", "html.https", "inf.1"],
      requires_human_review: false,
    },
  };
}

describe("FindingsService.persistStructuredAnalysis (integração)", () => {
  let mock: MockPrisma;
  let service: FindingsService;

  beforeEach(() => {
    mock = new MockPrisma();
    service = serviceFor(mock);
    mock.runs.push({
      id: "run-existing",
      companyId: "company-1",
      organizationId: "org-1",
      status: "RUNNING",
      createdAt: new Date(),
      startedAt: new Date(),
    });
  });

  it("persiste run COMPLETED com findings, evidências e recomendações", async () => {
    const result = await service.persistStructuredAnalysis("org-1", "company-1", baseInput());

    expect(result.status).toBe("COMPLETED");
    expect(result.requiresHumanReview).toBe(false);
    expect(mock.runs.find((r) => r.id === "run-existing")?.status).toBe("COMPLETED");
    expect(result.findingsCount).toBe(3);

    // 3 findings: determinístico + fato da IA + inferência
    expect(mock.findings).toHaveLength(3);
    expect(mock.evidence).toHaveLength(3);
    expect(mock.recommendations).toHaveLength(1);
  });

  it("sanitiza evidência (remove HTML e PII) e grava hash", async () => {
    await service.persistStructuredAnalysis("org-1", "company-1", baseInput());

    const ev = mock.evidence.find((e) => e.findingId === mock.findings[0].id);
    expect(ev).toBeDefined();
    expect(ev?.extractedText).toContain("[email]");
    expect(ev?.extractedText).not.toContain("contato@loja.com");
    expect(ev?.extractedText).not.toContain("<b>");
    expect(ev?.hash).toBeTruthy();
  });

  it("marca apenas findings listados e confiáveis como messageEligible", async () => {
    await service.persistStructuredAnalysis("org-1", "company-1", baseInput());

    const eligible = mock.findings.filter((f) => f.messageEligible);
    expect(eligible).toHaveLength(3);
    const inferred = mock.findings.find((f) => f.claim.includes("catálogo"));
    expect(inferred?.messageEligible).toBe(true);
  });

  it("inferência de baixa confiança torna o run PARTIAL e não elegível", async () => {
    const input = baseInput();
    input.output.inferences[0].confidence = 0.4;
    input.output.message_eligible_findings = ["contact.whatsapp.available", "html.https"];

    const result = await service.persistStructuredAnalysis("org-1", "company-1", input);

    expect(result.status).toBe("PARTIAL");
    expect(result.requiresHumanReview).toBe(true);
    const inferred = mock.findings.find((f) => f.claim.includes("catálogo"));
    expect(inferred?.messageEligible).toBe(false);
    expect(inferred?.requiresHumanReview).toBe(true);
  });

  it("fato com sourceType de IA força revisão humana e nunca é elegível", async () => {
    const input = baseInput();
    input.output.facts[0].sourceType = "AI_INFERENCE";
    input.output.message_eligible_findings = ["html.https"];

    const result = await service.persistStructuredAnalysis("org-1", "company-1", input);

    expect(result.requiresHumanReview).toBe(true);
    const fact = mock.findings.find((f) => f.claim.includes("HTTPS"));
    expect(fact?.messageEligible).toBe(false);
    expect(fact?.requiresHumanReview).toBe(true);
  });

  it("detecta conflitos e persiste analysis_conflicts", async () => {
    const input = baseInput();
    input.output.facts.push({
      id: "html.https.contradito",
      category: "fact",
      claim: "O site está acessível via HTTPS",
      value: false,
      valueType: "boolean",
      sourceType: "HTML_ANALYSIS",
      evidence: [{ sourceType: "HTML_ANALYSIS", evidenceType: "metric", url: "https://exemplo.com", metricName: "https", metricValue: 0 }],
    });

    await service.persistStructuredAnalysis("org-1", "company-1", input);

    expect(mock.conflicts.length).toBeGreaterThan(0);
    expect(mock.conflicts[0].nature).toBe("contradiction");
    expect(mock.conflicts[0].fromFindingId).toBeTruthy();
    expect(mock.conflicts[0].toFindingId).toBeTruthy();
  });

  it("nunca sobrescreve runs anteriores — cria novo run quando não há RUNNING", async () => {
    mock.runs = [];
    const result = await service.persistStructuredAnalysis("org-1", "company-1", baseInput());

    expect(mock.runs).toHaveLength(1);
    expect(mock.runs[0].status).toBe("COMPLETED");
    expect(result.runId).toBeTruthy();
  });
});