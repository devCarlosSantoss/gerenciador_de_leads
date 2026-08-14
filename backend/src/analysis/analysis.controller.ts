import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Post } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { CreateAnalysisDtoSchema } from "./analysis.dto";

function resolveOrg(headers: Record<string, string | undefined>): string {
  const org = headers["x-org-id"];
  if (!org) throw new BadRequestException("Cabeçalho X-Org-ID obrigatório");
  return org;
}

@Controller("leads/:id/analyze")
export class AnalysisController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  @Post()
  async run(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    CreateAnalysisDtoSchema.parse(body ?? {});
    const org = resolveOrg(headers);

    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: org, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Lead não encontrado");

    const job = await this.queue.queue("analysis").add(
      "analyze-company",
      { organizationId: org, companyId: id },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 4000 },
      },
    );

    // Registra a análise como QUEUED imediatamente, para acompanhamento em tempo real.
    await this.prisma.analysisRun.create({
      data: {
        organizationId: org,
        companyId: id,
        provider: "pending",
        model: "pending",
        promptVersion: "structured-v1",
        inputSnapshot: {},
        output: {},
        status: "QUEUED",
      } satisfies Prisma.AnalysisRunUncheckedCreateInput,
    });

    return {
      jobId: job.id,
      status: "queued",
      note: "Análise assíncrona — acompanhe o status em GET /leads/:id/analyze",
    };
  }

  /** Status e resultado da análise mais recente (com tempo decorrido ao vivo). */
  @Get()
  async status(
    @Param("id") id: string,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    const org = resolveOrg(headers);

    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: org, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Lead não encontrado");

    const analysis = await this.prisma.analysisRun.findFirst({
      where: { companyId: id },
      orderBy: { createdAt: "desc" },
    });

    const inProgress =
      analysis?.status === "QUEUED" || analysis?.status === "RUNNING";
    const elapsedMs = inProgress
      ? Math.max(
          0,
          Date.now() - (analysis.startedAt ?? analysis.createdAt).getTime(),
        )
      : null;

    return {
      company: { id: company.id, name: company.name, status: company.status },
      analysis: analysis
        ? {
            id: analysis.id,
            status: analysis.status,
            provider: analysis.provider,
            model: analysis.model,
            promptVersion: analysis.promptVersion,
            requiresHumanReview: analysis.requiresHumanReview,
            createdAt: analysis.createdAt,
            startedAt: analysis.startedAt,
            finishedAt: analysis.finishedAt,
            durationMs: analysis.durationMs,
            error: analysis.error,
            elapsedMs,
            output: analysis.output,
          }
        : null,
    };
  }
}