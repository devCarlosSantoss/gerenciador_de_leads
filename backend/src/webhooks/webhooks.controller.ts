import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { WebhooksService } from "./webhooks.service";
import { Public } from "../auth/public.decorator";

const webhookPayloadSchema = z.record(z.unknown()).refine((v) => Object.keys(v).length > 0, {
  message: "payload vazio",
});

@Public()
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  // Handshake de verificação (verify token) — Meta exige GET na configuração.
  @Get(":provider")
  async verify(
    @Param("provider") provider: string,
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
  ) {
    void provider;
    void token;
    if (mode === "subscribe" && challenge) return challenge;
    throw new BadRequestException("Falha na verificação do webhook");
  }

  @Post(":provider")
  async receive(
    @Param("provider") provider: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    // Fase 2: validar assinatura X-Hub-Signature-256 aqui.
    const parsed = webhookPayloadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Payload de webhook inválido");
    const result = await this.webhooks.receive(provider, parsed.data, headers["x-org-id"] ?? "default");
    return { ok: true, ...result };
  }
}