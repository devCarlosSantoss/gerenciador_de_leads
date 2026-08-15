import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FindingsService } from "./findings.service";
import { FindingsQueryDtoSchema } from "./analysis.dto";

@Controller("leads/:id/findings")
export class FindingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly findings: FindingsService,
  ) {}

  @Get()
  async list(
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
  ) {
    const q = FindingsQueryDtoSchema.parse(query ?? {});

    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");

    const run = await this.findings.getRunView(id, q.runId);
    if (!run) {
      return { lead: { id: lead.id, name: lead.name }, run: null };
    }
    return {
      lead: { id: lead.id, name: lead.name },
      run,
    };
  }
}