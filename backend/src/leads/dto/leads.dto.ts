import { z } from "zod";

// Contrato de entrada de lead — seção 1.2 do plano técnico.
// Validação de estrutura aqui; normalização/semântica no pipeline de ingestão.

const contactSchema = z.object({
  type: z.enum(["WHATSAPP", "INSTAGRAM", "EMAIL", "PHONE", "LINKEDIN"]),
  value: z.string().min(1).max(512),
  isPrimary: z.boolean().optional().default(false),
});

const companySchema = z
  .object({
    name: z.string().min(1).max(300),
    category: z.string().max(200).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    state: z.string().max(2).optional().nullable(),
    postalCode: z.string().max(12).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    website: z.string().max(500).optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    whatsapp: z.string().max(40).optional().nullable(),
    rating: z.number().min(0).max(5).optional().nullable(),
    reviewsCount: z.number().int().min(0).optional().nullable(),
  })
  .strict();

export const importLeadSchema = z
  .object({
    sourceKey: z.string().min(1).max(120),
    sourceUrl: z.string().url().optional().nullable(),
    externalId: z.string().max(255).optional().nullable(),
    collectedAt: z.string().datetime({ offset: true }),
    purpose: z.string().max(500).optional().nullable(),
    company: companySchema,
    contacts: z.array(contactSchema).max(20).optional().default([]),
    raw: z.record(z.unknown()).optional(),
  })
  .strict();

export const importLeadsSchema = z.object({
  items: z.array(importLeadSchema).min(1).max(500),
  organizationId: z.string().min(1).optional(), // injetado do cabeçalho X-Org-ID
  actorId: z.string().optional(),
});

export type ImportLeadDto = z.infer<typeof importLeadSchema>;
export type ImportLeadsDto = z.infer<typeof importLeadsSchema>;

export const leadFiltersSchema = z.object({
  status: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  category: z.string().optional(),
  source: z.string().optional(),
  scoreMin: z.coerce.number().min(0).max(100).optional(),
  scoreMax: z.coerce.number().min(0).max(100).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type LeadFiltersDto = z.infer<typeof leadFiltersSchema>;