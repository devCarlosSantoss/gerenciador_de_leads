import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { CreateAnalysisDtoSchema } from "./analysis.dto";

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
  ) {
    CreateAnalysisDtoSchema.parse(body ?? {});

    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");

    const job = await this.queue.queue("analysis").add(
      "analyze-company",
      { companyId: id },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 4000 },
      },
    );

    await this.prisma.analysisRun.create({
      data: {
        leadId: id,
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

  @Get()
  async status(
    @Param("id") id: string,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");

    const analysis = await this.prisma.analysisRun.findFirst({
      where: { leadId: id },
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
      lead: { id: lead.id, name: lead.name, status: lead.status },
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