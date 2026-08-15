import { Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { MessagesService } from "./messages.service";

@Controller("leads/:id/messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post("generate")
  async generate(@Param("id") id: string) {
    return this.messages.generate(id);
  }

  @Get()
  async list(@Param("id") id: string) {
    return this.messages.listForCompany(id);
  }

  @Post(":messageId/approve")
  async approve(
    @Param("id") id: string,
    @Param("messageId") messageId: string,
  ) {
    void id;
    return this.messages.approve(messageId);
  }

  @Get(":messageId/chat-link")
  async chatLink(
    @Param("id") id: string,
    @Param("messageId") messageId: string,
  ) {
    void id;
    return this.messages.buildChatLink(messageId);
  }
}