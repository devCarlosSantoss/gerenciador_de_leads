import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { ImportLeadsDto, importLeadsSchema, leadFiltersSchema, LeadFiltersDto } from "./dto/leads.dto";

// NOTA (Fase 1): sem autenticação real ainda. O cabeçalho X-Org-ID simula o
// tenant resolvido pelo token JWT/OAuth previsto na arquitetura.
function resolveOrg(headers: Record<string, string | undefined>): string {
  const org = headers["x-org-id"];
  if (!org) throw new BadRequestException("Cabeçalho X-Org-ID obrigatório (Fase 1: simula o tenant do token)");
  return org;
}

@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post("import")
  async import(@Body() body: unknown, @Headers() headers: Record<string, string | undefined>) {
    const parsed = importLeadsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: "Payload de importação inválido",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const organizationId = resolveOrg(headers);
    return this.leads.ingestBatch({ ...parsed.data, organizationId, actorId: headers["x-user-id"] });
  }

  @Get()
  async list(@Query() query: unknown, @Headers() headers: Record<string, string | undefined>) {
    const parsed = leadFiltersSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ error: "Filtros inválidos", issues: parsed.error.issues });
    return this.leads.list(resolveOrg(headers), parsed.data as LeadFiltersDto);
  }

  @Get("by-external/:externalId")
  async byExternal(@Param("externalId") externalId: string, @Headers() headers: Record<string, string | undefined>) {
    return this.leads.findByExternalId(resolveOrg(headers), externalId);
  }

  @Post(":id/mark-contacted")
  async markContacted(@Param("id") id: string, @Headers() headers: Record<string, string | undefined>) {
    return this.leads.markContacted(resolveOrg(headers), id, headers["x-user-id"]);
  }

  @Get(":id")
  async detail(@Param("id") id: string, @Headers() headers: Record<string, string | undefined>) {
    return this.leads.detail(resolveOrg(headers), id);
  }
}