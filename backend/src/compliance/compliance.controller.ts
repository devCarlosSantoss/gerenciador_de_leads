import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ComplianceService } from "./compliance.service";
import type { ContactChannel, ConsentStatus, LegalBasis } from "@prisma/client";

const channels = ["WHATSAPP", "INSTAGRAM", "EMAIL", "PHONE", "LINKEDIN"] as const;
const consentStatuses = ["NOT_APPLICABLE", "GRANTED", "DENIED", "WITHDRAWN", "IMPLIED"] as const;
const legalBases = ["LEGITIMATE_INTEREST", "CONTRACT", "CONSENT", "PUBLIC_INFO", "NO_BASIS"] as const;
const reasons = ["OPT_OUT", "COMPLAINT", "BLOCKED", "SPAM", "NO_BASIS"] as const;

const consentSchema = z.object({
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  channel: z.enum(channels),
  status: z.enum(consentStatuses),
  legalBasis: z.enum(legalBases),
  proof: z.record(z.unknown()).optional(),
  sourceKey: z.string().min(1),
});

const suppressionSchema = z.object({
  companyId: z.string().optional(),
  contact: z.string().optional(),
  channel: z.enum(channels),
  reason: z.enum(reasons),
  sourceKey: z.string().min(1),
  note: z.string().optional(),
});

function resolveOrg(headers: Record<string, string | undefined>): string {
  const org = headers["x-org-id"];
  if (!org) throw new BadRequestException("Cabeçalho X-Org-ID obrigatório");
  return org;
}

@Controller()
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Post("consents")
  async consent(@Body() body: unknown, @Headers() headers: Record<string, string | undefined>) {
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ error: "Payload inválido", issues: parsed.error.issues });
    const { companyId, ...rest } = parsed.data;
    return this.compliance.registerConsent({
      organizationId: resolveOrg(headers),
      companyId,
      ...rest,
    } as Parameters<ComplianceService["registerConsent"]>[0]);
  }

  @Post("suppression")
  async suppress(@Body() body: unknown, @Headers() headers: Record<string, string | undefined>) {
    const parsed = suppressionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ error: "Payload inválido", issues: parsed.error.issues });
    return this.compliance.registerSuppression({
      organizationId: resolveOrg(headers),
      ...parsed.data,
    });
  }

  @Get("suppression")
  async list(@Query("companyId") companyId: string | undefined, @Headers() headers: Record<string, string | undefined>) {
    return this.compliance.isSuppressed(resolveOrg(headers), companyId);
  }
}