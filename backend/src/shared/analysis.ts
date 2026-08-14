/**
 * Tipos compartilhados da análise estruturada — usados pelo frontend e pelo
 * backend. Mantenha em sincronia com os enums de `backend/prisma/schema.prisma`.
 */

export const FINDING_CATEGORIES = ["FACT", "INFERENCE", "UNKNOWN", "RISK"] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_VALUE_TYPES = [
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "URL",
  "METRIC",
  "JSON",
] as const;
export type FindingValueType = (typeof FINDING_VALUE_TYPES)[number];

export const EVIDENCE_SOURCE_TYPES = [
  "WEBSITE_HTTP",
  "HTML_ANALYSIS",
  "LIGHTHOUSE",
  "PAGESPEED",
  "DNS",
  "SOCIAL_PUBLIC",
  "USER_INPUT",
  "AI_INFERENCE",
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export const EVIDENCE_TYPES = [
  "HTML_ELEMENT",
  "TEXT",
  "METRIC",
  "SCREENSHOT",
  "EXTERNAL_DOC",
  "USER_INPUT",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/** Confiança mínima para uma inferência poder ser usada em mensagens. */
export const MESSAGE_CONFIDENCE_THRESHOLD = 0.6;

/** Fontes determinísticas (não derivadas de IA). */
export const DETERMINISTIC_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  "WEBSITE_HTTP",
  "HTML_ANALYSIS",
  "LIGHTHOUSE",
  "PAGESPEED",
  "DNS",
  "SOCIAL_PUBLIC",
  "USER_INPUT",
];

export function isDeterministicSource(type: EvidenceSourceType): boolean {
  return DETERMINISTIC_SOURCE_TYPES.includes(type);
}

export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  FACT: "Fato",
  INFERENCE: "Inferência",
  UNKNOWN: "Desconhecido",
  RISK: "Risco",
};

export const SOURCE_TYPE_LABELS: Record<EvidenceSourceType, string> = {
  WEBSITE_HTTP: "HTTP do site",
  HTML_ANALYSIS: "Análise de HTML",
  LIGHTHOUSE: "Lighthouse",
  PAGESPEED: "PageSpeed",
  DNS: "DNS",
  SOCIAL_PUBLIC: "Rede social pública",
  USER_INPUT: "Entrada do usuário",
  AI_INFERENCE: "Inferência da IA",
};

/** Visualização de um finding (o que a tela precisa). */
export interface FindingView {
  id: string;
  category: FindingCategory;
  claim: string;
  value: unknown;
  valueType: FindingValueType;
  sourceType: EvidenceSourceType;
  confidence: number | null;
  requiresHumanReview: boolean;
  messageEligible: boolean;
  createdAt: string;
  evidence: EvidenceView[];
}

export interface EvidenceView {
  id: string;
  url: string | null;
  evidenceType: EvidenceType;
  sourceType: EvidenceSourceType;
  selector: string | null;
  extractedText: string | null;
  metricName: string | null;
  metricValue: number | null;
  screenshotReference: string | null;
  collectedAt: string;
  hash: string;
}

export interface RecommendationView {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  confidence: number | null;
  priority: string | null;
  requiresHumanReview: boolean;
  createdAt: string;
}

export interface ConflictView {
  id: string;
  nature: string;
  resolution: string | null;
  from: { id: string; claim: string };
  to: { id: string; claim: string };
  createdAt: string;
}

export interface AnalysisRunView {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
  requiresHumanReview: boolean;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  output: Record<string, unknown> | null;
  findings: FindingView[];
  recommendations: RecommendationView[];
  conflicts: ConflictView[];
}
