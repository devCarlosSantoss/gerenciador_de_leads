import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { ImportLeadsDto, LeadFiltersDto } from "./dto/leads.dto";
import {
  normalizeName,
  normalizePhoneE164,
  normalizeDomain,
  normalizeEmail,
  normalizeHandle,
  isBrazilianMobile,
} from "./normalization.service";
import { DedupService, buildDedupKeys } from "./dedup.service";
import type { Prisma } from "@prisma/client";

export interface IngestSummary {
  accepted: number;
  enqueued: boolean;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly dedup: DedupService,
  ) {}

  async ingestBatch(dto: ImportLeadsDto): Promise<IngestSummary> {
    const { actorId, items } = dto;

    const rows = items.map((item) => ({
      sourceKey: item.sourceKey,
      externalId: item.externalId ?? null,
      leadName: item.company.name,
      rawPayload: item as unknown as Prisma.InputJsonValue,
      collectedAt: new Date(item.collectedAt),
      purpose: item.purpose ?? null,
      status: "PENDING" as const,
    }));

    const created = await this.prisma.$transaction(
      rows.map((r) => this.prisma.leadImport.create({ data: r })),
    );

    await this.queue.queue("ingest").add("process-batch", {
      importIds: created.map((c) => c.id),
    });

    return { accepted: created.length, enqueued: true };
  }

  async processImportItem(importId: string): Promise<void> {
    const leadImport = await this.prisma.leadImport.findUnique({
      where: { id: importId },
    });
    if (!leadImport) throw new NotFoundException(`Import ${importId} não encontrado`);

    const item = leadImport.rawPayload as unknown as {
      company: {
        name: string;
        category?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        website?: string | null;
        phone?: string | null;
        whatsapp?: string | null;
        rating?: number | null;
        reviewsCount?: number | null;
      };
      contacts?: Array<{ type: string; value: string; isPrimary?: boolean }>;
    };

    const c = item.company;

    const phoneE164 = normalizePhoneE164(c.phone ?? c.whatsapp ?? null);
    const email = (item.contacts ?? []).find((k) => k.type === "EMAIL")
      ? normalizeEmail((item.contacts ?? []).find((k) => k.type === "EMAIL")!.value)
      : null;
    const domain = normalizeDomain(c.website ?? null);

    const dedup = await this.dedup.findDuplicate({
      name: c.name,
      city: c.city ?? null,
      state: c.state ?? null,
      email,
      keys: buildDedupKeys({ externalId: leadImport.externalId, phone: c.phone ?? c.whatsapp, website: c.website }),
    });

    if (dedup.result === "DUPLICATE_EXACT") {
      await this.prisma.leadImport.update({
        where: { id: importId },
        data: { status: "COMPLETED", dedupResult: "DUPLICATE_EXACT", dedupReason: dedup.reason, matchedLeadId: dedup.matchedLeadId },
      });
      return;
    }

    if (dedup.result === "DUPLICATE_SUGGESTED") {
      await this.prisma.leadImport.update({
        where: { id: importId },
        data: { status: "PARTIAL", dedupResult: "DUPLICATE_SUGGESTED", dedupReason: dedup.reason, matchedLeadId: dedup.matchedLeadId },
      });
      return;
    }

    const lead = await this.prisma.lead.create({
      data: {
        externalId: leadImport.externalId ?? null,
        name: c.name,
        nameNormalized: normalizeName(c.name),
        category: c.category ?? null,
        address: c.address ?? null,
        city: c.city ?? null,
        state: c.state ? c.state.toUpperCase().slice(0, 2) : null,
        postalCode: c.postalCode ?? null,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        phoneE164,
        canonicalDomain: domain?.domain ?? null,
        rating: c.rating ?? null,
        reviewsCount: c.reviewsCount ?? null,
        websiteStatus: domain ? "UNKNOWN" : "NO_WEBSITE",
        status: "NEW",
        dataOrigin: leadImport.sourceKey,
        sourceUrl: (leadImport.rawPayload as { sourceUrl?: string }).sourceUrl ?? null,
        collectedAt: leadImport.collectedAt,
        purpose: leadImport.purpose ?? null,
        legalBasis: "NO_BASIS",
      },
    });

    const contacts = (item.contacts ?? []).map((ct) => {
      const normalized =
        ct.type === "EMAIL" ? normalizeEmail(ct.value) ?? null
        : ct.type === "PHONE" || ct.type === "WHATSAPP" ? normalizePhoneE164(ct.value)
        : ct.type === "INSTAGRAM" || ct.type === "LINKEDIN" ? normalizeHandle(ct.value)
        : null;
      return {
        leadId: lead.id,
        type: ct.type as "WHATSAPP" | "INSTAGRAM" | "EMAIL" | "PHONE" | "LINKEDIN",
        value: ct.value.trim(),
        valueNormalized: normalized ?? ct.value.trim().toLowerCase(),
        isPrimary: ct.isPrimary ?? false,
        isValid: normalized !== null,
        sourceKey: leadImport.sourceKey,
      };
    });

    if (phoneE164 && !contacts.some((k) => k.type === "WHATSAPP" && k.valueNormalized === phoneE164)) {
      contacts.push({
        leadId: lead.id,
        type: "WHATSAPP",
        value: phoneE164,
        valueNormalized: phoneE164,
        isPrimary: contacts.length === 0,
        isValid: true,
        sourceKey: leadImport.sourceKey,
      });
    }

    if (contacts.length > 0) {
      await this.prisma.leadContact.createMany({ data: contacts, skipDuplicates: true });
    }

    if (domain) {
      await this.prisma.leadWebsite.create({
        data: { leadId: lead.id, url: domain.canonicalUrl!, domain: domain.domain },
      });
    }

    for (const sc of item.contacts ?? []) {
      if ((sc.type === "INSTAGRAM" || sc.type === "LINKEDIN") && sc.value) {
        const handle = normalizeHandle(sc.value);
        if (handle) {
          await this.prisma.socialProfile.create({
            data: {
              leadId: lead.id,
              platform: sc.type === "INSTAGRAM" ? "INSTAGRAM" : "LINKEDIN",
              handle,
              verifiedBy: leadImport.sourceKey,
            },
          }).catch(() => this.logger.warn(`perfil social duplicado ignorado: ${handle}`));
        }
      }
    }

    await this.prisma.leadImport.update({
      where: { id: importId },
      data: { status: "COMPLETED", dedupResult: "NEW", matchedLeadId: lead.id },
    });
  }

  async processBatch(importIds: string[]): Promise<void> {
    for (const id of importIds) {
      try {
        await this.processImportItem(id);
      } catch (err) {
        this.logger.error(`Falha ao processar import ${id}: ${(err as Error).message}`);
        await this.prisma.leadImport.update({
          where: { id },
          data: { status: "FAILED", error: (err as Error).message.slice(0, 500) },
        });
      }
    }
  }

  async list(filters: LeadFiltersDto) {
    const where: Prisma.LeadWhereInput = { deletedAt: null };

    if (filters.status) where.status = filters.status as never;
    if (filters.city) where.city = { contains: filters.city, mode: "insensitive" };
    if (filters.state) where.state = filters.state.toUpperCase();
    if (filters.category) where.category = { contains: filters.category, mode: "insensitive" };
    if (filters.source) where.dataOrigin = filters.source;
    if (filters.q) where.name = { contains: filters.q, mode: "insensitive" };

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const [total, leads] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
          contacts: { where: { deletedAt: null }, take: 5 },
        },
      }),
    ]);

    return {
      data: leads.map((l) => ({
        id: l.id,
        externalId: l.externalId,
        name: l.name,
        category: l.category,
        city: l.city,
        state: l.state,
        status: l.status,
        contactStatus: l.contactStatus,
        websiteStatus: l.websiteStatus,
        score: l.scores[0]?.score ?? null,
        scoreTier: l.scores[0]?.tier ?? null,
        contacts: l.contacts.map((k) => ({ type: k.type, value: k.value })),
      })),
      total,
      page,
      pageSize,
    };
  }

  async markContacted(leadId: string, actorId?: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: "CONTACTED_CONFIRMED" },
    });

    return { status: updated.status, message: "Lead marcado como contatado (envio manual)" };
  }

  async findByExternalId(externalId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { externalId, deletedAt: null },
    });
    if (!lead) {
      throw new NotFoundException("Lead não encontrado — verifique se ele foi migrado para o novo sistema");
    }
    return {
      id: lead.id,
      name: lead.name,
      category: lead.category,
      city: lead.city,
      state: lead.state,
      status: lead.status,
    };
  }

  async detail(leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      include: {
        contacts: { where: { deletedAt: null } },
        websites: {
          where: { deletedAt: null },
          include: { audits: { orderBy: { auditedAt: "desc" }, take: 1 } },
        },
        socialProfiles: { where: { deletedAt: null } },
        scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
        analysisRuns: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");

    const suppressed = await this.prisma.suppressionList.findFirst({
      where: {
        OR: [
          { leadId: lead.id },
          ...lead.contacts.map((k) => ({ contact: k.valueNormalized, channel: k.type })),
        ],
      },
    });

    return { ...lead, suppressed: Boolean(suppressed) };
  }
}