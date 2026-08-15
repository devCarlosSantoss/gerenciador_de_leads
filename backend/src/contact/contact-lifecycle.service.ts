import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  isAllowedTransition,
  legacyStatusFor,
  ACTIVITY_EVENT_TYPES,
  type LeadStatus,
} from "../shared/contact-lifecycle";

export interface LifecycleContext {
  actorId?: string;
  actorType?: "user" | "system" | "worker";
  messageId?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

const LEGACY_BACKFILLABLE: LeadStatus[] = [
  "ANALYZING",
  "ANALYZED",
  "MESSAGE_GENERATED",
  "MESSAGE_PENDING_APPROVAL",
  "MESSAGE_APPROVED",
  "CHAT_LINK_OPENED",
  "MESSAGE_COPIED",
  "SEND_CONFIRMATION_PENDING",
  "CONTACTED_CONFIRMED",
  "REPLIED",
  "QUALIFIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
  "CONVERTED",
  "NOT_INTERESTED",
  "LOST",
  "OPT_OUT",
  "BLOCKED",
  "ARCHIVED",
];

@Injectable()
export class ContactLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  private async applyTransition(
    tx: Prisma.TransactionClient,
    leadId: string,
    to: LeadStatus,
    ctx: LifecycleContext,
  ) {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");

    const from: LeadStatus = (lead.contactStatus as LeadStatus) ?? "NEW";
    const isBackfill = lead.contactStatus === null && LEGACY_BACKFILLABLE.includes(to);
    const valid = isBackfill || isAllowedTransition(from, to);

    if (!valid) {
      throw new BadRequestException(
        `Transição inválida: ${from} → ${to}. Reative o lead (estado NEW) se desejar um novo ciclo de contato.`,
      );
    }
    if (!isBackfill && from === to) {
      return { ok: true, idempotent: true, from, to };
    }

    if (to === "CONTACTED_CONFIRMED") {
      if (lead.contactedConfirmedAt) {
        throw new BadRequestException(
          "Envio já confirmado para este lead. Reative o contato (estado NEW) antes de um novo envio.",
        );
      }
      if (!ctx.messageId) {
        throw new BadRequestException("Confirmação de envio exige messageId");
      }
      const message = await tx.messageDraft.findFirst({
        where: { id: ctx.messageId, leadId },
      });
      if (!message) throw new NotFoundException("Mensagem não encontrada");
      if (message.status !== "APPROVED") {
        throw new BadRequestException(
          `Mensagem precisa estar aprovada antes de confirmar o envio (status atual: ${message.status})`,
        );
      }
      const suppressed = await this.isSuppressed(tx, leadId);
      if (suppressed) {
        throw new BadRequestException(
          "Contato suprimido (opt-out/oposição) — envio bloqueado",
        );
      }
    }

    const transitionName = isBackfill ? `legacy.backfill->${to}` : `${from}->${to}`;
    const now = new Date();

    const data: Prisma.LeadUpdateInput = {
      contactStatus: to,
      status: legacyStatusFor(to) as never,
      contactedConfirmedAt:
        to === "CONTACTED_CONFIRMED"
          ? now
          : to === "NEW"
            ? null
            : lead.contactedConfirmedAt,
    };

    const updated = await tx.lead.update({ where: { id: leadId }, data });

    await tx.contactStatusHistory.create({
      data: {
        leadId,
        fromStatus: isBackfill ? null : from,
        toStatus: to,
        transition: transitionName,
        actorId: ctx.actorId,
        actorType: ctx.actorType ?? "user",
        messageId: ctx.messageId,
        channel: ctx.channel as never,
        metadata: (ctx.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await tx.activityEvent.create({
      data: {
        leadId,
        messageId: ctx.messageId,
        actorId: ctx.actorId,
        actorType: ctx.actorType ?? "user",
        eventType:
          to === "NEW"
            ? ACTIVITY_EVENT_TYPES.RECONTACTED
            : ACTIVITY_EVENT_TYPES.STATUS_TRANSITION,
        entityType: "leads",
        entityId: leadId,
        channel: ctx.channel as never,
        payload: {
          from: isBackfill ? null : from,
          to,
          transition: transitionName,
          ...(ctx.metadata ?? {}),
        } as Prisma.InputJsonValue,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });

    return { ok: true, idempotent: false, from: isBackfill ? null : from, to, legacyStatus: updated.status };
  }

  private async isSuppressed(tx: Prisma.TransactionClient, leadId: string) {
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      include: { contacts: { where: { deletedAt: null } } },
    });
    const contactValues = (lead?.contacts ?? []).map((c) => c.valueNormalized);
    return tx.suppressionList.findFirst({
      where: {
        OR: [
          { leadId },
          ...(contactValues.length > 0 ? contactValues.map((contact) => ({ contact })) : []),
        ],
      },
    });
  }

  private async recordAttempt(
    tx: Prisma.TransactionClient,
    leadId: string,
    data: {
      messageId?: string;
      channel?: string;
      action: string;
      confirmedBy?: string;
      confirmedAt?: Date;
      metadata?: Record<string, unknown>;
    },
  ) {
    return tx.contactAttempt.create({
      data: {
        leadId,
        messageId: data.messageId,
        channel: data.channel as never,
        action: data.action,
        confirmedBy: data.confirmedBy,
        confirmedAt: data.confirmedAt,
        metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async openChatLink(leadId: string, messageId: string, ctx: LifecycleContext) {
    if (!messageId) throw new BadRequestException("messageId obrigatório");
    return this.prisma.$transaction(async (tx) => {
      const message = await this.requireApprovedMessage(tx, leadId, messageId);
      const from = (await this.leadStatus(tx, leadId)).contactStatus ?? "NEW";
      const res = await this.applyTransition(tx, leadId, "CHAT_LINK_OPENED", {
        ...ctx,
        messageId,
        channel: message.channel,
      });
      await this.recordAttempt(tx, leadId, {
        messageId,
        channel: message.channel,
        action: "LINK_OPENED",
        confirmedBy: ctx.actorId,
        metadata: { from },
      });
      return { ...res, action: "LINK_OPENED" };
    });
  }

  async copyMessage(leadId: string, messageId: string, ctx: LifecycleContext) {
    if (!messageId) throw new BadRequestException("messageId obrigatório");
    return this.prisma.$transaction(async (tx) => {
      const message = await this.requireApprovedMessage(tx, leadId, messageId);
      const from = (await this.leadStatus(tx, leadId)).contactStatus ?? "NEW";
      const res = await this.applyTransition(tx, leadId, "MESSAGE_COPIED", {
        ...ctx,
        messageId,
        channel: message.channel,
      });
      await this.recordAttempt(tx, leadId, {
        messageId,
        channel: message.channel,
        action: "MESSAGE_COPIED",
        confirmedBy: ctx.actorId,
        metadata: { from },
      });
      return { ...res, action: "MESSAGE_COPIED" };
    });
  }

  async confirmSend(leadId: string, messageId: string, ctx: LifecycleContext) {
    if (!messageId) throw new BadRequestException("messageId obrigatório");
    return this.prisma.$transaction(async (tx) => {
      const message = await this.requireApprovedMessage(tx, leadId, messageId);
      const lead = await this.leadStatus(tx, leadId);
      if (lead.contactedConfirmedAt) {
        throw new BadRequestException(
          "Envio já confirmado para este lead. Reative o contato (estado NEW) antes de um novo envio.",
        );
      }

      const res = await this.applyTransition(tx, leadId, "CONTACTED_CONFIRMED", {
        ...ctx,
        messageId,
        channel: message.channel,
      });

      const now = new Date();
      await tx.messageDraft.update({
        where: { id: messageId },
        data: { status: "SENT", sentAt: now, sentBy: ctx.actorId ?? null },
      });
      await this.recordAttempt(tx, leadId, {
        messageId,
        channel: message.channel,
        action: "SEND_CONFIRMED",
        confirmedBy: ctx.actorId,
        confirmedAt: now,
        metadata: { from: res.from },
      });
      await tx.activityEvent.create({
        data: {
          leadId,
          messageId,
          actorId: ctx.actorId,
          actorType: ctx.actorType ?? "user",
          eventType: ACTIVITY_EVENT_TYPES.SEND_CONFIRMED,
          entityType: "messages",
          entityId: messageId,
          channel: message.channel,
          payload: { confirmedAt: now.toISOString() } as Prisma.InputJsonValue,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      });

      return {
        ok: true,
        action: "SEND_CONFIRMED",
        from: res.from,
        to: "CONTACTED_CONFIRMED",
        messageStatus: "SENT",
        messageId,
        confirmedAt: now,
        legacyStatus: res.legacyStatus,
      };
    });
  }

  async registerReply(leadId: string, ctx: LifecycleContext & { content?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const from = (await this.leadStatus(tx, leadId)).contactStatus ?? "NEW";
      const res = await this.applyTransition(tx, leadId, "REPLIED", ctx);
      const now = new Date();
      await this.recordAttempt(tx, leadId, {
        channel: "WHATSAPP",
        action: "REPLY_REGISTERED",
        confirmedBy: ctx.actorId,
        confirmedAt: now,
        metadata: { from, content: ctx.content ?? null },
      });
      return { ...res, action: "REPLY_REGISTERED", repliedAt: now };
    });
  }

  async registerOptOut(leadId: string, ctx: LifecycleContext & { reason?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const from = (await this.leadStatus(tx, leadId)).contactStatus ?? "NEW";
      const now = new Date();
      await tx.suppressionList.create({
        data: {
          leadId,
          channel: "WHATSAPP",
          reason: ctx.reason ?? "Opt-out registrado pelo operador",
          sourceKey: `manual-opt-out:${leadId}:${now.getTime()}`,
        },
      });
      const res = await this.applyTransition(tx, leadId, "OPT_OUT", ctx);
      await this.recordAttempt(tx, leadId, {
        channel: "WHATSAPP",
        action: "OPT_OUT_REGISTERED",
        confirmedBy: ctx.actorId,
        confirmedAt: now,
        metadata: { from, reason: ctx.reason ?? null },
      });
      return { ...res, action: "OPT_OUT_REGISTERED", optOutAt: now };
    });
  }

  async transition(leadId: string, to: LeadStatus, ctx: LifecycleContext) {
    return this.prisma.$transaction(async (tx) => {
      return this.applyTransition(tx, leadId, to, ctx);
    });
  }

  async getLifecycle(leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");

    const [history, attempts, events] = await Promise.all([
      this.prisma.contactStatusHistory.findMany({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.contactAttempt.findMany({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.activityEvent.findMany({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    return {
      leadId,
      contactStatus: (lead.contactStatus as LeadStatus) ?? "NEW",
      legacyStatus: lead.status,
      contactedConfirmedAt: lead.contactedConfirmedAt,
      history,
      attempts,
      events,
    };
  }

  private async requireApprovedMessage(
    tx: Prisma.TransactionClient,
    leadId: string,
    messageId: string,
  ) {
    const message = await tx.messageDraft.findFirst({
      where: { id: messageId, leadId },
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada");
    if (message.status !== "APPROVED") {
      throw new BadRequestException(
        `Mensagem precisa estar aprovada (status atual: ${message.status})`,
      );
    }
    return message;
  }

  private async leadStatus(tx: Prisma.TransactionClient, leadId: string) {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");
    return lead;
  }
}