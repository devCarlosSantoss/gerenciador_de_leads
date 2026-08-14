import { describe, expect, it } from "vitest";
import { computeScore, type ScoreInput } from "../src/scoring/scoring.service";

function base(): ScoreInput {
  return {
    name: "Mecânica Silva Ltda",
    category: "Oficina mecânica",
    city: "São Paulo",
    websiteStatus: "NO_WEBSITE",
    rating: 4.6,
    reviewsCount: 132,
    validContactCount: 1,
    hasVerifiedWhatsapp: false,
    analysis: null,
    targetCities: ["São Paulo"],
  };
}

describe("computeScore", () => {
  it("pontua alto para lead bem aderente com site ausente", () => {
    const r = computeScore(base());
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.tier).toBe("MEDIUM");
  });

  it("hard-zero para contato suprimido", () => {
    const r = computeScore({ ...base(), suppressed: true });
    expect(r.score).toBe(0);
    expect(r.tier).toBe("LOW");
    expect(r.rationale).toContain("suprimido");
  });

  it("soma consentimento/interação prévia", () => {
    const without = computeScore(base());
    const withConsent = computeScore({ ...base(), consentStatus: "GRANTED" });
    expect(withConsent.score).toBe(without.score + 5);
  });

  it("penaliza segmentos sensíveis", () => {
    const sensitive = computeScore({ ...base(), category: "Clínica de tratamento" });
    expect(sensitive.components.riskPenalty).toBe(-5);
  });

  it("classifica faixas corretamente", () => {
    expect(computeScore({ ...base(), suppressed: true }).tier).toBe("LOW");
    const high = computeScore({
      ...base(),
      reviewsCount: 200,
      validContactCount: 2,
      analysis: {
        website_quality: { critical_issues: ["sem agendamento", "lento"] },
        business_opportunities: [{ confidence: "high" }],
      },
    });
    expect(["HIGH", "MEDIUM"]).toContain(high.tier);
    expect(high.components.apparentNeed).toBeGreaterThan(0);
  });

  it("nunca passa de 100 nem fica negativo", () => {
    const extreme = computeScore({
      ...base(),
      reviewsCount: 5000,
      validContactCount: 3,
      analysis: {
        website_quality: { critical_issues: ["a", "b", "c"] },
        business_opportunities: [{ confidence: "high" }, { confidence: "high" }, { confidence: "high" }],
      },
      consentStatus: "GRANTED",
    });
    expect(extreme.score).toBeLessThanOrEqual(100);
    expect(extreme.score).toBeGreaterThanOrEqual(0);
  });
});