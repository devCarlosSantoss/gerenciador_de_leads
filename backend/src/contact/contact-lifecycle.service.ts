import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ContactStatus, ContactAttemptAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  isAllowedTransition,
  legacyStatusFor,
  ACTIVITY_EVENT_TYPES,
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

/**
 * Estados compatíveis com leads legados cujo `contactStatus` ainda é nulo
 * (adotados após a migração para a máquina de estados). Permite registrar a
 * chegada de leads já adiantados no funil sem forçar o caminho desde NEW.
 */
const LEGACY_BACKFILLABLE: ContactStatus[] = [
  "ANALYZING",
  "ANALYZED",
  "MESSAGE_GENERATED",
  "PENDING_APPROVAL",
  "APPROVED",
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

  /**
   * Aplica uma transição válida dentro de uma transação, atualizando em bloco:
   * Company (contactStatus + status legado), histórico de estados, evento de
   * atividade. Rejeita transições inválidas.
   */
  private async applyTransition(
    tx: Prisma.TransactionClient,
    orgId: string,
    companyId: string,
    to: ContactStatus,
    ctx: LifecycleContext,
  ) {
    const company = await tx.company.findFirst({
      where: { id: companyId, organizationId: orgId, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Lead não encontrado");

    const from: ContactStatus = company.contactStatus ?? "NEW";
    const isBackfill = company.contactStatus === null && LEGACY_BACKFILLABLE.includes(to);
    const valid = isBackfill || isAllowedTransition(from, to);

    if (!valid) {
      throw new BadRequestException(
        `Transição inválida: ${from} → ${to}. Reative o lead (estado NEW) se desejar um novo ciclo de contato.`,
      );
    }
    if (!isBackfill && from === to) {
      // Idempotente: estado já alcançado não gera novos registros.
      return { ok: true, idempotent: true, from, to };
    }

    // Guarda: confirmação de envio exige mensagem aprovada e ausência de
    // confirmação anterior (não é possível confirmar duas vezes sem recontato).
    if (to === "CONTACTED_CONFIRMED") {
      if (company.contactedConfirmedAt) {
        throw new BadRequestException(
          "Envio já confirmado para este lead. Reative o contato (estado NEW) antes de um novo envio.",
        );
      }
      if (!ctx.messageId) {
        throw new BadRequestException("Confirmação de envio exige messageId");
      }
      const message = await tx.message.findFirst({
        where: { id: ctx.messageId, organizationId: orgId, companyId },
      });
      if (!message) throw new NotFoundException("Mensagem não encontrada");
      if (message.status !== "APPROVED") {
        throw new BadRequestException(
          `Mensagem precisa estar aprovada antes de confirmar o envio (status atual: ${message.status})`,
        );
      }
      const suppressed = await this.isSuppressed(tx, orgId, companyId);
      if (suppressed) {
        throw new BadRequestException(
          "Contato suprimido (opt-out/oposição) — envio bloqueado",
        );
      }
    }

    const transitionName = isBackfill ? `legacy.backfill->${to}` : `${from}->${to}`;
    const now = new Date();

    const data: Prisma.CompanyUpdateInput = {
      contactStatus: to,
      status: legacyStatusFor(to) as never,
      contactedConfirmedAt:
        to === "CONTACTED_CONFIRMED"
          ? now
          : to === "NEW"
            ? null
            : company.contactedConfirmedAt,
    };

    const updated = await tx.company.update({ where: { id: companyId }, data });

    await tx.contactStatusHistory.create({
      data: {
        organizationId: orgId,
        companyId,
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
        organizationId: orgId,
        companyId,
        messageId: ctx.messageId,
        actorId: ctx.actorId,
        actorType: ctx.actorType ?? "user",
        eventType:
          to === "NEW"
            ? ACTIVITY_EVENT_TYPES.RECONTACTED
            : ACTIVITY_EVENT_TYPES.STATUS_TRANSITION,
        entityType: "companies",
        entityId: companyId,
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

  /** Verifica se o lead (empresa ou contatos) está na suppression list. */
  private async isSuppressed(tx: Prisma.TransactionClient, orgId: string, companyId: string) {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      include: { contacts: { where: { deletedAt: null } } },
    });
    const contactValues = (company?.contacts ?? []).map((c) => c.valueNormalized);
    return tx.suppressionList.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { companyId },
          ...(contactValues.length > 0 ? contactValues.map((contact) => ({ contact })) : []),
        ],
      },
    });
  }

  private async recordAttempt(
    tx: Prisma.TransactionClient,
    orgId: string,
    companyId: string,
    data: {
      messageId?: string;
      channel?: string;
      action: ContactAttemptAction;
      confirmedByUserId?: string;
      confirmedAt?: Date;
      metadata?: Record<string, unknown>;
    },
  ) {
    return tx.contactAttempt.create({
      data: {
        organizationId: orgId,
        leadId: companyId,
        messageId: data.messageId,
        channel: data.channel as never,
        action: data.action,
        confirmedByUserId: data.confirmedByUserId,
        confirmedAt: data.confirmedAt,
        metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Registra a abertura do link do WhatsApp. NUNCA confirma envio. */
  async openChatLink(orgId: string, companyId: string, messageId: string, ctx: LifecycleContext) {
    if (!messageId) throw new BadRequestException("messageId obrigatório");
    return this.prisma.$transaction(async (tx) => {
      const message = await this.requireApprovedMessage(tx, orgId, companyId, messageId);
      const from = (await this.companyStatus(tx, orgId, companyId)).contactStatus ?? "NEW";
      const res = await this.applyTransition(tx, orgId, companyId, "CHAT_LINK_OPENED", {
        ...ctx,
        messageId,
        channel: message.channel,
      });
      await this.recordAttempt(tx, orgId, companyId, {
        messageId,
        channel: message.channel,
        action: "LINK_OPENED",
        confirmedByUserId: ctx.actorId,
        metadata: { from },
      });
      return { ...res, action: "LINK_OPENED" };
    });
  }

  /** Registra a cópia da mensagem. NUNCA confirma envio. */
  async copyMessage(orgId: string, companyId: string, messageId: string, ctx: LifecycleContext) {
    if (!messageId) throw new BadRequestException("messageId obrigatório");
    return this.prisma.$transaction(async (tx) => {
      const message = await this.requireApprovedMessage(tx, orgId, companyId, messageId);
      const from = (await this.companyStatus(tx, orgId, companyId)).contactStatus ?? "NEW";
      const res = await this.applyTransition(tx, orgId, companyId, "MESSAGE_COPIED", {
        ...ctx,
        messageId,
        channel: message.channel,
      });
      await this.recordAttempt(tx, orgId, companyId, {
        messageId,
        channel: message.channel,
        action: "MESSAGE_COPIED",
        confirmedByUserId: ctx.actorId,
        metadata: { from },
      });
      return { ...res, action: "MESSAGE_COPIED" };
    });
  }

  /**
   * Confirmação EXPLÍCITA do operador de que a mensagem foi enviada no WhatsApp.
   * Único caminho para CONTACTED_CONFIRMED. Marca a mensagem como SENT.
   */
  async confirmSend(orgId: string, companyId: string, messageId: string, ctx: LifecycleContext) {
    if (!messageId) throw new BadRequestException("messageId obrigatório");
    return this.prisma.$transaction(async (tx) => {
      const message = await this.requireApprovedMessage(tx, orgId, companyId, messageId);
      const company = await this.companyStatus(tx, orgId, companyId);
      if (company.contactedConfirmedAt) {
        throw new BadRequestException(
          "Envio já confirmado para este lead. Reative o contato (estado NEW) antes de um novo envio.",
        );
      }

      const res = await this.applyTransition(tx, orgId, companyId, "CONTACTED_CONFIRMED", {
        ...ctx,
        messageId,
        channel: message.channel,
      });

      const now = new Date();
      await tx.message.update({
        where: { id: messageId },
        data: { status: "SENT", sentAt: now, sentByUserId: ctx.actorId ?? null },
      });
      await this.recordAttempt(tx, orgId, companyId, {
        messageId,
        channel: message.channel,
        action: "SEND_CONFIRMED",
        confirmedByUserId: ctx.actorId,
        confirmedAt: now,
        metadata: { from: res.from },
      });
      await tx.activityEvent.create({
        data: {
          organizationId: orgId,
          companyId,
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

  /** Registra resposta do lead após contato. */
  async registerReply(orgId: string, companyId: string, ctx: LifecycleContext & { content?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const from = (await this.companyStatus(tx, orgId, companyId)).contactStatus ?? "NEW";
      const res = await this.applyTransition(tx, orgId, companyId, "REPLIED", ctx);
      const now = new Date();
      await this.recordAttempt(tx, orgId, companyId, {
        channel: "WHATSAPP",
        action: "REPLY_REGISTERED",
        confirmedByUserId: ctx.actorId,
        confirmedAt: now,
        metadata: { from, content: ctx.content ?? null },
      });
      return { ...res, action: "REPLY_REGISTERED", repliedAt: now };
    });
  }

  /** Registra opt-out do lead (insere na suppression list e move para OPT_OUT). */
  async registerOptOut(orgId: string, companyId: string, ctx: LifecycleContext & { reason?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const from = (await this.companyStatus(tx, orgId, companyId)).contactStatus ?? "NEW";
      const now = new Date();
      await tx.suppressionList.create({
        data: {
          organizationId: orgId,
          companyId,
          channel: "WHATSAPP",
          reason: ctx.reason ?? "Opt-out registrado pelo operador",
          sourceKey: `manual-opt-out:${companyId}:${now.getTime()}`,
        },
      });
      const res = await this.applyTransition(tx, orgId, companyId, "OPT_OUT", ctx);
      await this.recordAttempt(tx, orgId, companyId, {
        channel: "WHATSAPP",
        action: "OPT_OUT_REGISTERED",
        confirmedByUserId: ctx.actorId,
        confirmedAt: now,
        metadata: { from, reason: ctx.reason ?? null },
      });
      return { ...res, action: "OPT_OUT_REGISTERED", optOutAt: now };
    });
  }

  /** Transição genérica (QUALIFIED, MEETING_BOOKED, PROPOSAL_SENT, CONVERTED, LOST, ARCHIVED, recontato NEW...). */
  async transition(orgId: string, companyId: string, to: ContactStatus, ctx: LifecycleContext) {
    return this.prisma.$transaction(async (tx) => {
      return this.applyTransition(tx, orgId, companyId, to, ctx);
    });
  }

  /** Estado atual + histórico de transições, tentativas e eventos do lead. */
  async getLifecycle(orgId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, organizationId: orgId, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Lead não encontrado");

    const [history, attempts, events] = await Promise.all([
      this.prisma.contactStatusHistory.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.contactAttempt.findMany({
        where: { leadId: companyId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.activityEvent.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    return {
      companyId,
      contactStatus: company.contactStatus ?? "NEW",
      legacyStatus: company.status,
      contactedConfirmedAt: company.contactedConfirmedAt,
      history,
      attempts,
      events,
    };
  }

  private async requireApprovedMessage(
    tx: Prisma.TransactionClient,
    orgId: string,
    companyId: string,
    messageId: string,
  ) {
    const message = await tx.message.findFirst({
      where: { id: messageId, organizationId: orgId, companyId },
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada");
    if (message.status !== "APPROVED") {
      throw new BadRequestException(
        `Mensagem precisa estar aprovada (status atual: ${message.status})`,
      );
    }
    return message;
  }

  private async companyStatus(tx: Prisma.TransactionClient, orgId: string, companyId: string) {
    const company = await tx.company.findFirst({
      where: { id: companyId, organizationId: orgId, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Lead não encontrado");
    return company;
  }
}
