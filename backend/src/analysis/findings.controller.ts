import { BadRequestException, Controller, Get, Headers, NotFoundException, Param, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FindingsService } from "./findings.service";
import { FindingsQueryDtoSchema } from "./analysis.dto";

function resolveOrg(headers: Record<string, string | undefined>): string {
  const org = headers["x-org-id"];
  if (!org) throw new BadRequestException("Cabeçalho X-Org-ID obrigatório");
  return org;
}

/** Findings/evidências estruturados de um lead (tela de análise auditável). */
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
    @Headers() headers: Record<string, string | undefined>,
  ) {
    const org = resolveOrg(headers);
    const q = FindingsQueryDtoSchema.parse(query ?? {});

    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: org, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Lead não encontrado");

    const run = await this.findings.getRunView(org, id, q.runId);
    if (!run) {
      return { company: { id: company.id, name: company.name }, run: null };
    }
    return {
      company: { id: company.id, name: company.name },
      run,
    };
  }
}