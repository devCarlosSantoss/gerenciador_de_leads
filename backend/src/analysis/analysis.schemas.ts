import { z } from "zod";
import {
  EVIDENCE_SOURCE_TYPES,
  DETERMINISTIC_SOURCE_TYPES,
} from "../shared/analysis";

// Schemas de saída estruturada da IA — validados no código (seção 4.3 do plano).
//
// Contrato obrigatório de saída (análise estruturada, verificável e auditável):
// fatos, inferências, desconhecidos, oportunidades, riscos e quais findings são
// elegíveis para personalizar mensagens. Nenhuma mensagem pode ser gerada a
// partir de texto livre.

const sourceTypeEnum = z.enum(EVIDENCE_SOURCE_TYPES);
const categoryEnum = z.enum(["fact", "inference", "unknown", "risk"]);
const valueTypeEnum = z.enum(["string", "number", "boolean", "url", "metric"]);
const evidenceKindEnum = z.enum([
  "html_element",
  "text",
  "metric",
  "screenshot",
  "external_doc",
  "user_input",
]);

export const evidenceRefSchema = z
  .object({
    sourceType: sourceTypeEnum,
    url: z.string().url().max(2048).optional(),
    evidenceType: evidenceKindEnum,
    selector: z.string().max(500).optional(),
    extractedText: z.string().max(2000).optional(),
    metricName: z.string().max(120).optional(),
    metricValue: z.number().optional(),
    screenshotReference: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      !v.url &&
      !v.selector &&
      !v.extractedText &&
      !v.metricName &&
      v.metricValue === undefined &&
      !v.screenshotReference
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evidência precisa de ao menos url, texto, métrica ou seletor",
      });
    }
  });

export const structuredFindingSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_.-]+$/i, "id deve ser simples (letras, números, _, - e .)"),
    category: categoryEnum,
    claim: z.string().min(1).max(500),
    value: z.union([z.string().max(500), z.number(), z.boolean()]).optional(),
    valueType: valueTypeEnum,
    sourceType: sourceTypeEnum,
    confidence: z.number().min(0).max(1).optional(),
    requiresHumanReview: z.boolean().optional(),
    evidence: z.array(evidenceRefSchema).max(8).default([]),
  })
  .superRefine((f, ctx) => {
    if (f.category === "inference" && typeof f.confidence !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confidence"],
        message: "inferência precisa de confidence (0..1)",
      });
    }
    if (f.category === "inference" && DETERMINISTIC_SOURCE_TYPES.includes(f.sourceType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceType"],
        message: "inferência deve usar AI_INFERENCE como sourceType",
      });
    }
    if (f.category === "fact" && f.evidence.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence"],
        message: "fato precisa de ao menos uma evidência",
      });
    }
  });

export const opportunitySchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(1000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  evidenceFindingIds: z.array(z.string().max(64)).max(10).optional(),
});

/** JSON de saída OBRIGATÓRIO da análise estruturada. */
export const structuredAnalysisSchema = z.object({
  facts: z.array(structuredFindingSchema).max(50),
  inferences: z.array(structuredFindingSchema).max(50),
  unknowns: z.array(structuredFindingSchema).max(30),
  opportunities: z.array(opportunitySchema).max(20),
  risks: z.array(structuredFindingSchema).max(30),
  message_eligible_findings: z.array(z.string().min(1).max(64)).max(30),
  requires_human_review: z.boolean(),
});

export type StructuredAnalysis = z.infer<typeof structuredAnalysisSchema>;

/** Schema completo do LLM: contrato obrigatório + metadados compatíveis. */
export const llmAnalysisSchema = structuredAnalysisSchema.extend({
  company_summary: z.string().max(2000).optional(),
  business_segment: z.string().max(200).optional(),
  website_status: z.enum(["no_website", "active", "unreachable", "parked", "unknown"]).optional(),
  target_fit: z.object({
    score: z.number().min(0).max(100),
    reason: z.string().max(500),
  }).optional(),
  website_quality: z
    .object({
      score: z.number().min(0).max(100),
      evidence: z.array(z.string()).max(50),
      critical_issues: z.array(z.string()).max(50),
      minor_issues: z.array(z.string()).max(50),
      unknowns: z.array(z.string()).max(50),
    })
    .optional(),
  recommended_approach: z.string().max(2000).optional(),
  lead_score: z.number().min(0).max(100).optional(),
  contact_recommendation: z
    .enum(["do_not_contact", "manual_review", "draft_only", "eligible_for_official_flow"])
    .optional(),
});

export type LlmAnalysis = z.infer<typeof llmAnalysisSchema>;

// Schemas legados mantidos para compatibilidade (geração de mensagens).
export const targetFitSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string(),
});

export const websiteQualitySchema = z.object({
  score: z.number().min(0).max(100),
  evidence: z.array(z.string()),
  critical_issues: z.array(z.string()),
  minor_issues: z.array(z.string()),
  unknowns: z.array(z.string()),
});

export const businessOpportunitySchema = z.object({
  service: z.string(),
  reason: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const leadAnalysisSchema = z.object({
  company_summary: z.string(),
  business_segment: z.string(),
  target_fit: targetFitSchema,
  website_status: z.enum(["no_website", "active", "unreachable", "parked", "unknown"]),
  website_quality: websiteQualitySchema,
  business_opportunities: z.array(businessOpportunitySchema),
  recommended_approach: z.string(),
  lead_score: z.number().min(0).max(100),
  contact_recommendation: z.enum([
    "do_not_contact",
    "manual_review",
    "draft_only",
    "eligible_for_official_flow",
  ]),
  personalization_points: z.array(z.string()),
  risks: z.array(z.string()),
  suggested_message: z.string().max(600),
  message_reasoning: z.string(),
});

export type LeadAnalysis = z.infer<typeof leadAnalysisSchema>;

export const messageDraftSchema = z.object({
  length: z.enum(["short", "medium", "long"]),
  text: z.string(),
  personalization_evidence: z.array(z.string()),
});

export const messageGenerationSchema = z.object({
  status: z.enum(["ready", "manual_review"]),
  messages: z.array(messageDraftSchema).max(3),
});

export type MessageGeneration = z.infer<typeof messageGenerationSchema>;
