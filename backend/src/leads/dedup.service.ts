import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import {
  normalizeName,
  normalizePhoneE164,
  normalizeDomain,
  normalizeEmail,
} from "./normalization.service";
import type { DedupResult } from "@prisma/client";

export interface DedupKey {
  externalId?: string;
  phoneE164?: string;
  canonicalDomain?: string;
}

export interface DedupOutcome {
  result: DedupResult;
  matchedLeadId: string | null;
  reason: string;
}

@Injectable()
export class DedupService {
  constructor(private readonly prisma: PrismaService) {}

  async findDuplicate(data: {
    name: string;
    city?: string | null;
    state?: string | null;
    email?: string | null;
    keys: DedupKey;
  }): Promise<DedupOutcome> {
    const none: DedupOutcome = { result: "NEW", matchedLeadId: null, reason: "" };

    const or: Prisma.LeadWhereInput[] = [];
    if (data.keys.externalId) or.push({ externalId: data.keys.externalId });
    if (data.keys.phoneE164) or.push({ phoneE164: data.keys.phoneE164 });
    if (data.keys.canonicalDomain) or.push({ canonicalDomain: data.keys.canonicalDomain });

    if (or.length > 0) {
      const exact = await this.prisma.lead.findFirst({
        where: { deletedAt: null, OR: or },
      });
      if (exact) {
        return {
          result: "DUPLICATE_EXACT",
          matchedLeadId: exact.id,
          reason: `Duplicata exata (externalId/telefone/domínio) com "${exact.name}"`,
        };
      }
    }

    if (data.email) {
      const byEmail = await this.prisma.leadContact.findFirst({
        where: {
          deletedAt: null,
          type: "EMAIL",
          valueNormalized: data.email,
        },
      });
      if (byEmail) {
        return {
          result: "DUPLICATE_EXACT",
          matchedLeadId: byEmail.leadId,
          reason: `Duplicata exata por e-mail "${data.email}"`,
        };
      }
    }

    if (data.city) {
      const suggested = await this.prisma.lead.findFirst({
        where: {
          deletedAt: null,
          nameNormalized: normalizeName(data.name),
          city: data.city,
          ...(data.state ? { state: data.state } : {}),
        },
      });
      if (suggested) {
        return {
          result: "DUPLICATE_SUGGESTED",
          matchedLeadId: suggested.id,
          reason: `Possível duplicata por nome+cidade: "${suggested.name}"`,
        };
      }
    }

    return none;
  }
}

export function buildDedupKeys(data: {
  externalId?: string | null;
  phone?: string | null;
  website?: string | null;
}): DedupKey {
  return {
    externalId: data.externalId?.trim() || undefined,
    phoneE164: normalizePhoneE164(data.phone) ?? undefined,
    canonicalDomain: normalizeDomain(data.website)?.domain ?? undefined,
  };
}