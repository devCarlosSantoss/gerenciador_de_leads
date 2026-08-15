import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { QueueService } from "../queue/queue.service";
import { AnalysisService } from "./analysis.service";
import { MessagesService } from "../messages/messages.service";

interface AnalysisJobData {
  companyId: string;
}

@Injectable()
export class AnalysisWorker implements OnModuleInit {
  private readonly logger = new Logger(AnalysisWorker.name);

  constructor(
    private readonly queue: QueueService,
    private readonly analysis: AnalysisService,
    private readonly messages: MessagesService,
  ) {}

  onModuleInit() {
    this.queue.registerWorker<AnalysisJobData>("analysis", async (job) => {
      const { companyId } = job.data;

      await this.analysis.begin(companyId);

      await this.analysis.analyze(companyId);

      try {
        await this.messages.generate(companyId);
      } catch (err) {
        this.logger.warn(
          `Falha ao gerar mensagens após análise de ${companyId}: ${(err as Error).message}`,
        );
      }
    });
  }
}