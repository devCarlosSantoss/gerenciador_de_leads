import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { ContactChannel, ConsentStatus, LegalBasis } from "@prisma/client";

export interface RegisterConsentInput {
  organizationId: string;
  companyId: string;
  contactId?: string;
  channel: ContactChannel;
  status: ConsentStatus;
  legalBasis: LegalBasis;
  proof?: Record<string, unknown>;
  sourceKey: string;
}

export interface RegisterSuppressionInput {
  organizationId: string;
  companyId?: string;
  contact?: string;
  channel: ContactChannel;
  reason: "OPT_OUT" | "COMPLAINT" | "BLOCKED" | "SPAM" | "NO_BASIS";
  sourceKey: string;
  note?: string;
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async registerConsent(input: RegisterConsentInput) {
    const existing = await this.prisma.consentRecord.findUnique({
      where: {
        organizationId_companyId_channel: {
          organizationId: input.organizationId,
          companyId: input.companyId,
          channel: input.channel,
        },
      },
    });

    const now = new Date();
    const data = {
      contactId: input.contactId ?? null,
      status: input.status,
      legalBasis: input.legalBasis,
      proof: input.proof ? (input.proof as never) : undefined,
      sourceKey: input.sourceKey,
      grantedAt: input.status === "GRANTED" ? now : null,
      withdrawnAt: input.status === "WITHDRAWN" ? now : null,
    };

    const record = existing
      ? await this.prisma.consentRecord.update({ where: { id: existing.id }, data })
      : await this.prisma.consentRecord.create({
          data: { ...data, organizationId: input.organizationId, companyId: input.companyId, channel: input.channel },
        });

    await this.audit.record({
      organizationId: input.organizationId,
      actorType: "user",
      action: "consent.registered",
      entityType: "consent_records",
      entityId: record.id,
      after: { channel: input.channel, status: input.status, legalBasis: input.legalBasis },
    });

    return record;
  }

  /** Opt-out / oposição — bloqueio IMEDIATO de novos contatos. */
  async registerSuppression(input: RegisterSuppressionInput) {
    if (!input.companyId && !input.contact) {
      throw new NotFoundException("Informe companyId ou contact");
    }

    const record = await this.prisma.suppressionList.create({
      data: {
        organizationId: input.organizationId,
        companyId: input.companyId ?? null,
        contact: input.contact ?? null,
        channel: input.channel,
        reason: input.reason,
        sourceKey: input.sourceKey,
        note: input.note ?? null,
      },
    });

    if (input.companyId) {
      await this.prisma.company.update({
        where: { id: input.companyId },
        data: { status: "OPT_OUT", legalBasis: "NO_BASIS" },
      });
      const consent = await this.prisma.consentRecord.findUnique({
        where: {
          organizationId_companyId_channel: {
            organizationId: input.organizationId,
            companyId: input.companyId,
            channel: input.channel,
          },
        },
      });
      if (consent && consent.status !== "WITHDRAWN") {
        await this.prisma.consentRecord.update({
          where: { id: consent.id },
          data: { status: "WITHDRAWN", withdrawnAt: new Date() },
        });
      }
    }

    await this.audit.record({
      organizationId: input.organizationId,
      actorType: "user",
      action: "suppression.registered",
      entityType: "suppression_list",
      entityId: record.id,
      after: { channel: input.channel, reason: input.reason, contact: input.contact },
    });

    return record;
  }

  /** Consulta de supressão — usada como barreira em tempo real antes de qualquer envio. */
  async isSuppressed(organizationId: string, companyId?: string, contact?: string, channel?: ContactChannel): Promise<boolean> {
    const where: { organizationId: string; OR: Array<Record<string, unknown>> } = {
      organizationId,
      OR: [],
    };
    if (companyId) where.OR.push({ companyId });
    if (contact) where.OR.push({ contact, ...(channel ? { channel } : {}) });
    if (where.OR.length === 0) return false;
    const hit = await this.prisma.suppressionList.findFirst({ where });
    return Boolean(hit);
  }
}