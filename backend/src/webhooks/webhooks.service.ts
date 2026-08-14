import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashContent } from "../leads/normalization.service";

export interface WebhookResult {
  status: "processed" | "duplicate";
  eventId: string;
}

/**
 * Recebimento de webhooks de provedores (WhatsApp Cloud API, Instagram Graph API).
 * Idempotência garantida por eventId UNIQUE — eventos repetidos nunca são
 * processados duas vezes (critério de aceite #8 do MVP).
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async receive(provider: string, payload: Record<string, unknown>, organizationId = "default"): Promise<WebhookResult> {
    const eventId = this.extractEventId(provider, payload);

    const existing = await this.prisma.webhookEvent.findUnique({ where: { eventId } });
    if (existing) {
      if (existing.status === "DUPLICATE") {
        return { status: "duplicate", eventId };
      }
      await this.prisma.webhookEvent.update({
        where: { id: existing.id },
        data: { status: "DUPLICATE" },
      });
      return { status: "duplicate", eventId };
    }

    await this.prisma.webhookEvent.create({
      data: {
        organizationId,
        provider,
        eventId,
        eventType: this.extractEventType(provider, payload),
        payload: payload as never,
        status: "RECEIVED",
      },
    });

    // Processamento real (status/entrega/resposta → mensagens/conversas) entra na
    // Fase 2 com a integração oficial. Aqui registramos a auditoria.
    try {
      await this.prisma.webhookEvent.update({
        where: { eventId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      return { status: "processed", eventId };
    } catch (err) {
      this.logger.error(`Falha ao processar webhook ${eventId}: ${(err as Error).message}`);
      await this.prisma.webhookEvent.update({
        where: { eventId },
        data: { status: "FAILED", lastError: (err as Error).message.slice(0, 500) },
      });
      throw err;
    }
  }

  private extractEventId(provider: string, payload: Record<string, unknown>): string {
    // Payloads oficiais da Meta têm entry[].id + changes[].field/value.id.
    const entryId = (payload as { entry?: Array<{ id?: string }> }).entry?.[0]?.id;
    if (provider === "meta" && entryId) return `meta:${entryId}`;
    if (typeof payload.eventId === "string") return payload.eventId;
    // Fallback: hash estável do payload (nunca cria duplicata em replay idêntico).
    return `hash:${hashContent(JSON.stringify(payload))}`;
  }

  private extractEventType(provider: string, payload: Record<string, unknown>): string {
    const change = (payload as { entry?: Array<{ changes?: Array<{ field?: string }> }> }).entry?.[0]?.changes?.[0]?.field;
    if (change) return change;
    if (typeof payload.eventType === "string") return payload.eventType;
    return "unknown";
  }
}