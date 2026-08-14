import { describe, expect, it } from "vitest";
import { llmAnalysisSchema, structuredAnalysisSchema } from "../src/analysis/analysis.schemas";
import { evaluateFinding, detectConflicts } from "../src/analysis/findings.service";
import { sanitizeText, stripPII, cleanEvidenceText, hashEvidence } from "../src/analysis/evidence-sanitizer";
import { buildDeterministicFindings } from "../src/analysis/deterministic-facts";

function validOutput() {
  return {
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
        claim: "Pode se beneficiar de um catálogo online",
        value: "probável",
        valueType: "string",
        sourceType: "AI_INFERENCE",
        confidence: 0.8,
        evidence: [{ sourceType: "AI_INFERENCE", evidenceType: "text", extractedText: "Fato: sem catálogo" }],
      },
    ],
    unknowns: [],
    opportunities: [{ title: "Criar catálogo online", confidence: 0.7, priority: "high", evidenceFindingIds: ["inf.1"] }],
    risks: [],
    message_eligible_findings: ["html.https", "inf.1"],
    requires_human_review: false,
  };
}

describe("structuredAnalysisSchema (contrato obrigatório da IA)", () => {
  it("aceita saída válida com fatos evidenciados e inferências com confiança", () => {
    expect(structuredAnalysisSchema.safeParse(validOutput()).success).toBe(true);
  });

  it("rejeita saída sem o campo obrigatório requires_human_review", () => {
    const rest = { ...validOutput() };
    delete (rest as Record<string, unknown>).requires_human_review;
    expect(structuredAnalysisSchema.safeParse(rest).success).toBe(false);
  });

  it("rejeita fato sem evidência", () => {
    const out = validOutput();
    out.facts = [{ id: "f.1", category: "fact", claim: "Sem prova", valueType: "string", sourceType: "HTML_ANALYSIS", evidence: [] }];
    const parsed = structuredAnalysisSchema.safeParse(out);
    expect(parsed.success).toBe(false);
  });

  it("rejeita inferência sem confidence", () => {
    const out = validOutput();
    out.inferences = [{ id: "i.1", category: "inference", claim: "chute", valueType: "string", sourceType: "AI_INFERENCE", evidence: [] }];
    expect(structuredAnalysisSchema.safeParse(out).success).toBe(false);
  });

  it("rejeita inferência com fonte determinística (nunca como fato)", () => {
    const out = validOutput();
    out.inferences[0].sourceType = "HTML_ANALYSIS";
    expect(structuredAnalysisSchema.safeParse(out).success).toBe(false);
  });

  it("rejeita evidência vazia (sem url/texto/métrica)", () => {
    const out = validOutput();
    out.facts[0].evidence = [{ sourceType: "HTML_ANALYSIS", evidenceType: "metric" }];
    expect(structuredAnalysisSchema.safeParse(out).success).toBe(false);
  });

  it("llmAnalysisSchema aceita o contrato obrigatório com campos legados opcionais", () => {
    const out = { ...validOutput(), company_summary: "resumo", website_status: "active" };
    expect(llmAnalysisSchema.safeParse(out).success).toBe(true);
  });
});

describe("evaluateFinding (validação de negócio)", () => {
  it("fato determinístico com evidência forte é elegível quando listado", () => {
    const r = evaluateFinding(
      {
        category: "FACT",
        sourceType: "HTML_ANALYSIS",
        evidence: [{ sourceType: "HTML_ANALYSIS", evidenceType: "METRIC", url: "https://x.com", metricValue: 1 }],
      },
      true,
    );
    expect(r.requiresHumanReview).toBe(false);
    expect(r.messageEligible).toBe(true);
  });

  it("fato sem evidência forte exige revisão humana e não é elegível", () => {
    const r = evaluateFinding(
      { category: "FACT", sourceType: "HTML_ANALYSIS", evidence: [] },
      true,
    );
    expect(r.requiresHumanReview).toBe(true);
    expect(r.messageEligible).toBe(false);
  });

  it("fato com sourceType de IA exige revisão humana", () => {
    const r = evaluateFinding(
      {
        category: "FACT",
        sourceType: "AI_INFERENCE",
        evidence: [{ sourceType: "AI_INFERENCE", evidenceType: "TEXT", extractedText: "x" }],
      },
      true,
    );
    expect(r.requiresHumanReview).toBe(true);
    expect(r.messageEligible).toBe(false);
  });

  it("inferência de baixa confiança exige revisão humana e não é elegível", () => {
    const r = evaluateFinding(
      {
        category: "INFERENCE",
        sourceType: "AI_INFERENCE",
        confidence: 0.5,
        evidence: [{ sourceType: "AI_INFERENCE", evidenceType: "TEXT", extractedText: "x" }],
      },
      true,
    );
    expect(r.requiresHumanReview).toBe(true);
    expect(r.messageEligible).toBe(false);
  });

  it("inferência confiável e listada é elegível", () => {
    const r = evaluateFinding(
      {
        category: "INFERENCE",
        sourceType: "AI_INFERENCE",
        confidence: 0.85,
        evidence: [{ sourceType: "AI_INFERENCE", evidenceType: "TEXT", extractedText: "x" }],
      },
      true,
    );
    expect(r.requiresHumanReview).toBe(false);
    expect(r.messageEligible).toBe(true);
  });

  it("inferência não listada em message_eligible_findings não é elegível", () => {
    const r = evaluateFinding(
      {
        category: "INFERENCE",
        sourceType: "AI_INFERENCE",
        confidence: 0.9,
        evidence: [{ sourceType: "AI_INFERENCE", evidenceType: "TEXT", extractedText: "x" }],
      },
      false,
    );
    expect(r.messageEligible).toBe(false);
  });
});

describe("detectConflicts", () => {
  it("detecta conflito entre dois fatos com mesmo tema e valores divergentes", () => {
    const conflicts = detectConflicts([
      { id: "a", category: "FACT", claim: "O site possui WhatsApp", value: true },
      { id: "b", category: "FACT", claim: "O site possui WhatsApp", value: false },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].nature).toBe("contradiction");
    expect(conflicts[0].resolution).toContain("fato");
  });

  it("não gera conflito para claims diferentes ou valores iguais", () => {
    const conflicts = detectConflicts([
      { id: "a", category: "FACT", claim: "Tem WhatsApp", value: true },
      { id: "b", category: "FACT", claim: "Tem e-mail", value: true },
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it("normaliza claim (ignora maiúsculas e acentos)", () => {
    const conflicts = detectConflicts([
      { id: "a", category: "INFERENCE", claim: "Possui catálogo", value: "sim" },
      { id: "b", category: "INFERENCE", claim: "Possui catálogo", value: "não" },
    ]);
    expect(conflicts).toHaveLength(1);
  });
});

describe("evidence-sanitizer", () => {
  it("remove tags HTML e colapsa espaços", () => {
    expect(sanitizeText("<p>Olá</p>\n<b> mundo</b>")).toBe("Olá mundo");
  });

  it("remove PII (e-mail e telefone)", () => {
    const t = stripPII("Contato: contato@loja.com.br tel 11 98765-4321");
    expect(t).not.toContain("contato@loja.com.br");
    expect(t).not.toContain("98765");
  });

  it("limita o tamanho do texto extraído", () => {
    const big = "a".repeat(5000);
    expect(cleanEvidenceText(big, 100).length).toBe(100);
  });

  it("hash é determinístico e sensível ao conteúdo", () => {
    const base = { url: "https://x.com", extractedText: "texto" };
    expect(hashEvidence(base)).toBe(hashEvidence(base));
    expect(hashEvidence(base)).not.toBe(hashEvidence({ ...base, extractedText: "outro" }));
  });
});

describe("buildDeterministicFindings", () => {
  it("gera fato de contato de WhatsApp com evidência USER_INPUT", () => {
    const facts = buildDeterministicFindings({
      websiteExists: true,
      hasWhatsappContact: true,
      hasValidContact: true,
      socialProfiles: [],
      websiteStatus: "ACTIVE",
    });
    const wa = facts.find((f) => f.id === "contact.whatsapp.available");
    expect(wa).toBeDefined();
    expect(wa?.sourceType).toBe("USER_INPUT");
    expect(wa?.evidence[0].sourceType).toBe("USER_INPUT");
  });

  it("gera fato de ausência de site quando não há website", () => {
    const facts = buildDeterministicFindings({
      websiteExists: false,
      hasWhatsappContact: false,
      hasValidContact: false,
      socialProfiles: [],
      websiteStatus: "NO_WEBSITE",
    });
    expect(facts.some((f) => f.id === "website.none")).toBe(true);
  });

  it("gera fato de DNS e PageSpeed com métrica na evidência", () => {
    const facts = buildDeterministicFindings({
      websiteExists: true,
      websiteUrl: "https://exemplo.com",
      dnsOk: true,
      httpStatus: 200,
      checks: { https: { ok: true }, pageSpeed: { performanceLabel: "Fast" } },
      metrics: { httpStatus: 200, htmlBytes: 5000, pageSpeed: { performanceScore: 0.85 } },
      pageSpeedMetrics: { performanceScore: 0.85 },
      pageSpeedChecks: { performanceLabel: "Fast" },
      hasWhatsappContact: false,
      hasValidContact: false,
      socialProfiles: [],
      websiteStatus: "ACTIVE",
    });
    const dns = facts.find((f) => f.id === "dns.ok");
    expect(dns?.value).toBe(true);
    const ps = facts.find((f) => f.id === "pagespeed.performance");
    expect(ps?.valueType).toBe("METRIC");
    expect(ps?.evidence[0].metricValue).toBe(0.85);
  });

  it("fatos determinísticos nunca têm sourceType AI_INFERENCE", () => {
    const facts = buildDeterministicFindings({
      websiteExists: true,
      hasWhatsappContact: true,
      hasValidContact: true,
      socialProfiles: [{ platform: "instagram" }],
      websiteStatus: "ACTIVE",
    });
    for (const f of facts) {
      expect(f.sourceType).not.toBe("AI_INFERENCE");
    }
  });
});
