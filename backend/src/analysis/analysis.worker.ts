import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { QueueService } from "../queue/queue.service";
import { AnalysisService } from "./analysis.service";
import { MessagesService } from "../messages/messages.service";

interface AnalysisJobData {
  organizationId: string;
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
      const { organizationId, companyId } = job.data;

      // Marca a análise como RUNNING (e registra o início) para acompanhamento.
      await this.analysis.begin(organizationId, companyId);

      // Em caso de falha, `analyze` registra o status FAILED e re-throws,
      // permitindo o retry automático do BullMQ (attempts: 3, backoff exponencial).
      await this.analysis.analyze(organizationId, companyId);

      // Encadeia a geração dos rascunhos de mensagem: o lead termina
      // AGUARDANDO_REVISAO com DRAFTs prontos para aprovação humana.
      try {
        await this.messages.generate(organizationId, companyId);
      } catch (err) {
        this.logger.warn(
          `Falha ao gerar mensagens após análise de ${companyId}: ${(err as Error).message}`,
        );
      }
    });
  }
}