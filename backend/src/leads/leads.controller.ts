import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { ImportLeadsDto, importLeadsSchema, leadFiltersSchema, LeadFiltersDto } from "./dto/leads.dto";

@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post("import")
  async import(@Body() body: unknown) {
    const parsed = importLeadsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: "Payload de importação inválido",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return this.leads.ingestBatch(parsed.data);
  }

  @Get()
  async list(@Query() query: unknown) {
    const parsed = leadFiltersSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ error: "Filtros inválidos", issues: parsed.error.issues });
    return this.leads.list(parsed.data as LeadFiltersDto);
  }

  @Get("by-external/:externalId")
  async byExternal(@Param("externalId") externalId: string) {
    return this.leads.findByExternalId(externalId);
  }

  @Post(":id/mark-contacted")
  async markContacted(@Param("id") id: string) {
    return this.leads.markContacted(id);
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    return this.leads.detail(id);
  }
}