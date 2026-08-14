import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ContactLifecycleService, type LifecycleContext } from "./contact-lifecycle.service";
import type { ContactStatus } from "../shared/contact-lifecycle";

function resolveOrg(headers: Record<string, string | undefined>): string {
  const org = headers["x-org-id"];
  if (!org) throw new BadRequestException("Cabeçalho X-Org-ID obrigatório");
  return org;
}

function contextFrom(headers: Record<string, string | undefined>): LifecycleContext {
  return {
    actorId: headers["x-user-id"],
    ipAddress: headers["x-forwarded-for"],
    userAgent: headers["user-agent"],
  };
}

@Controller("leads/:id/contact")
export class ContactController {
  constructor(private readonly lifecycle: ContactLifecycleService) {}

  @Get()
  async get(@Param("id") id: string, @Headers() headers: Record<string, string | undefined>) {
    return this.lifecycle.getLifecycle(resolveOrg(headers), id);
  }

  @Post("chat-link/open")
  async openChatLink(
    @Param("id") id: string,
    @Body() body: { messageId?: string },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    if (!body.messageId) throw new BadRequestException("messageId obrigatório");
    return this.lifecycle.openChatLink(resolveOrg(headers), id, body.messageId, contextFrom(headers));
  }

  @Post("copy")
  async copy(
    @Param("id") id: string,
    @Body() body: { messageId?: string },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    if (!body.messageId) throw new BadRequestException("messageId obrigatório");
    return this.lifecycle.copyMessage(resolveOrg(headers), id, body.messageId, contextFrom(headers));
  }

  @Post("confirm-send")
  async confirmSend(
    @Param("id") id: string,
    @Body() body: { messageId?: string },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    if (!body.messageId) throw new BadRequestException("messageId obrigatório");
    return this.lifecycle.confirmSend(resolveOrg(headers), id, body.messageId, contextFrom(headers));
  }

  @Post("reply")
  async reply(
    @Param("id") id: string,
    @Body() body: { content?: string },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.lifecycle.registerReply(resolveOrg(headers), id, {
      ...contextFrom(headers),
      content: body.content,
    });
  }

  @Post("opt-out")
  async optOut(
    @Param("id") id: string,
    @Body() body: { reason?: string },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.lifecycle.registerOptOut(resolveOrg(headers), id, {
      ...contextFrom(headers),
      reason: body.reason,
    });
  }

  @Post("status")
  async transition(
    @Param("id") id: string,
    @Body() body: { to?: ContactStatus; messageId?: string; metadata?: Record<string, unknown> },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    if (!body.to) throw new BadRequestException("Campo `to` obrigatório");
    return this.lifecycle.transition(resolveOrg(headers), id, body.to, {
      ...contextFrom(headers),
      messageId: body.messageId,
      metadata: body.metadata,
    });
  }
}