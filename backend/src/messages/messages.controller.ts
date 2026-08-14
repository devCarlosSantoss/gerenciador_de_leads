import { BadRequestException, Controller, Get, Headers, NotFoundException, Param, Post } from "@nestjs/common";
import { MessagesService } from "./messages.service";

function resolveOrg(headers: Record<string, string | undefined>): string {
  const org = headers["x-org-id"];
  if (!org) throw new BadRequestException("Cabeçalho X-Org-ID obrigatório");
  return org;
}

@Controller("leads/:id/messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post("generate")
  async generate(@Param("id") id: string, @Headers() headers: Record<string, string | undefined>) {
    return this.messages.generate(resolveOrg(headers), id);
  }

  @Get()
  async list(@Param("id") id: string, @Headers() headers: Record<string, string | undefined>) {
    return this.messages.listForCompany(resolveOrg(headers), id);
  }

  @Post(":messageId/approve")
  async approve(
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    void id; // o escopo por organização é validado no service via messageId
    return this.messages.approve(resolveOrg(headers), messageId, headers["x-user-id"]);
  }

  @Get(":messageId/chat-link")
  async chatLink(
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    void id;
    return this.messages.buildChatLink(resolveOrg(headers), messageId);
  }
}