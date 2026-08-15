import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const SCORING = {
  weights: {
    targetFit: 25,
    website: 15,
    investment: 10,
    contactEase: 10,
    whatsapp: 5,
    apparentNeed: 15,
    location: 5,
    dataReliability: 5,
    consentInteraction: 5,
    riskPenalty: -5,
  },
  tiers: [
    { min: 80, tier: "HIGH" as const },
    { min: 60, tier: "MEDIUM" as const },
    { min: 40, tier: "NURTURE" as const },
    { min: 0, tier: "LOW" as const },
  ],
};

export const TARGET_CATEGORY_KEYWORDS = [
  "restaurante", "bar", "pizzaria", "hamburgueria", "lanchonete", "cafeteria",
  "padaria", "confeitaria", "panificadora", "sorveteria", "açougue", "supermercado",
  "mercado", "mercearia", "loja", "boutique", "moda", "brechó",
  "oficina", "mecânica", "auto", "clínica", "dental", "salão", "barbearia",
  "academia", "pet", "tatuagem", "estética", "serviço", "marcenaria", "construção",
  "advocacia", "contabilidade", "fisioterapia", "escola", "hotel", "pousada",
  "pintor", "eletricista", "encanador", "manutenção", "segurança",
];

const SENSITIVE_CATEGORY_KEYWORDS = [
  "hospital", "saúde mental", "psicólogo", "tratamento", "reabilitação", "clínica de",
];

export interface ScoreInput {
  name: string;
  category: string | null;
  city: string | null;
  websiteStatus: string;
  rating: number | null;
  reviewsCount: number | null;
  validContactCount: number;
  hasVerifiedWhatsapp: boolean;
  analysis: {
    website_quality?: { critical_issues?: string[]; unknowns?: string[] };
    business_opportunities?: Array<{ confidence: string }>;
    opportunities?: Array<{ confidence?: number | string }>;
    risks?: Array<{ claim?: string }>;
    target_fit?: { score: number };
    lead_score?: number;
  } | null;
  consentStatus?: string | null;
  suppressed?: boolean;
  targetCities?: string[];
}

export interface ScoreResult {
  score: number;
  tier: "HIGH" | "MEDIUM" | "NURTURE" | "LOW";
  components: Record<string, number>;
  rationale: string;
}

export function computeScore(input: ScoreInput): ScoreResult {
  const w = SCORING.weights;
  const components: Record<string, number> = {};

  const cat = (input.category ?? "").toLowerCase();
  const targetHits = TARGET_CATEGORY_KEYWORDS.filter((k) => cat.includes(k)).length;
  const adherence = targetHits > 0 ? Math.min(25, 12 + targetHits * 4) : 6;
  components.targetFit = adherence;

  const siteScore =
    input.websiteStatus === "NO_WEBSITE" ? 15
    : input.websiteStatus === "UNREACHABLE" ? 8
    : input.websiteStatus === "ACTIVE" ? (input.analysis?.website_quality?.critical_issues?.length ? 12 : 4)
    : input.websiteStatus === "PARKED" ? 10
    : 2;
  components.website = siteScore;

  const reviews = input.reviewsCount ?? 0;
  components.investment = reviews >= 100 ? 10 : reviews >= 30 ? 7 : reviews > 0 ? 5 : 3;

  components.contactEase = Math.min(10, input.validContactCount * 4);

  components.whatsapp = input.hasVerifiedWhatsapp ? 5 : input.validContactCount > 0 ? 2 : 0;

  const criticals =
    (input.analysis?.website_quality?.critical_issues?.length ?? 0) +
    (input.analysis?.risks?.length ?? 0);
  const opportunities =
    (input.analysis?.opportunities?.length ?? 0) ||
    (input.analysis?.business_opportunities?.length ?? 0);
  components.apparentNeed = Math.min(15, criticals * 5 + opportunities * 3);

  const inScope = !input.targetCities?.length || (input.city ? input.targetCities.includes(input.city) : false);
  components.location = inScope ? 5 : 0;

  let reliable = 0;
  if (input.validContactCount > 0) reliable += 3;
  if (input.reviewsCount !== null) reliable += 1;
  if (input.city) reliable += 1;
  components.dataReliability = Math.min(5, reliable);

  const consentInteraction = input.consentStatus === "GRANTED" || input.consentStatus === "IMPLIED" ? 5 : 0;
  components.consentInteraction = consentInteraction;

  const risky = SENSITIVE_CATEGORY_KEYWORDS.some((k) => cat.includes(k));
  const penalty = risky ? w.riskPenalty : 0;
  components.riskPenalty = penalty;

  if (input.suppressed) {
    return { score: 0, tier: "LOW", components, rationale: "Contato suprimido (opt-out/oposição)" };
  }

  const score = Math.max(0, Math.min(100, Math.round(
    Object.values(components).reduce((a, b) => a + b, 0),
  )));

  const tier = SCORING.tiers.find((t) => score >= t.min)?.tier ?? "LOW";

  const rationale = [
    `aderência=${components.targetFit}/25`,
    `site=${components.website}/15`,
    `necessidade=${components.apparentNeed}/15`,
    `contato=${components.contactEase}/10`,
    consentInteraction > 0 ? "com consentimento" : "sem consentimento registrado",
  ].join(", ");

  return { score, tier, components, rationale };
}

@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaService) {}

  async computeFor(leadId: string): Promise<ScoreResult> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      include: {
        contacts: { where: { deletedAt: null } },
        analysisRuns: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!lead) throw new Error(`Lead ${leadId} não encontrado`);

    const suppression = await this.prisma.suppressionList.findFirst({
      where: { leadId },
    });

    const result = computeScore({
      name: lead.name,
      category: lead.category,
      city: lead.city,
      websiteStatus: lead.websiteStatus,
      rating: lead.rating,
      reviewsCount: lead.reviewsCount,
      validContactCount: lead.contacts.filter((c) => c.isValid).length,
      hasVerifiedWhatsapp: lead.contacts.some((c) => c.type === "WHATSAPP" && c.isVerified),
      analysis: lead.analysisRuns[0]?.output as ScoreInput["analysis"] ?? null,
      consentStatus: null,
      suppressed: Boolean(suppression),
    });

    await this.prisma.leadScore.create({
      data: {
        leadId,
        score: result.score,
        tier: result.tier,
        components: result.components as never,
        calculatedBy: "engine_v1",
        rationale: result.rationale,
      },
    });

    return result;
  }
}