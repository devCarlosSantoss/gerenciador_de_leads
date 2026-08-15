import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ContactLifecycleService, type LifecycleContext } from "./contact-lifecycle.service";
import type { LeadStatus } from "../shared/contact-lifecycle";

function contextFrom(): LifecycleContext {
  return {
    actorType: "user",
  };
}

@Controller("leads/:id/contact")
export class ContactController {
  constructor(private readonly lifecycle: ContactLifecycleService) {}

  @Get()
  async get(@Param("id") id: string) {
    return this.lifecycle.getLifecycle(id);
  }

  @Post("chat-link/open")
  async openChatLink(
    @Param("id") id: string,
    @Body() body: { messageId?: string },
  ) {
    if (!body.messageId) throw new BadRequestException("messageId obrigatório");
    return this.lifecycle.openChatLink(id, body.messageId, contextFrom());
  }

  @Post("copy")
  async copy(
    @Param("id") id: string,
    @Body() body: { messageId?: string },
  ) {
    if (!body.messageId) throw new BadRequestException("messageId obrigatório");
    return this.lifecycle.copyMessage(id, body.messageId, contextFrom());
  }

  @Post("confirm-send")
  async confirmSend(
    @Param("id") id: string,
    @Body() body: { messageId?: string },
  ) {
    if (!body.messageId) throw new BadRequestException("messageId obrigatório");
    return this.lifecycle.confirmSend(id, body.messageId, contextFrom());
  }

  @Post("reply")
  async reply(
    @Param("id") id: string,
    @Body() body: { content?: string },
  ) {
    return this.lifecycle.registerReply(id, {
      ...contextFrom(),
      content: body.content,
    });
  }

  @Post("opt-out")
  async optOut(
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.lifecycle.registerOptOut(id, {
      ...contextFrom(),
      reason: body.reason,
    });
  }

  @Post("status")
  async transition(
    @Param("id") id: string,
    @Body() body: { to?: LeadStatus; messageId?: string; metadata?: Record<string, unknown> },
  ) {
    if (!body.to) throw new BadRequestException("Campo `to` obrigatório");
    return this.lifecycle.transition(id, body.to, {
      ...contextFrom(),
      messageId: body.messageId,
      metadata: body.metadata,
    });
  }
}