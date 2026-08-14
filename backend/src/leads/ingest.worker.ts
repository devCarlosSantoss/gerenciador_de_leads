import { Injectable, OnModuleInit } from "@nestjs/common";
import { QueueService } from "../queue/queue.service";
import { LeadsService } from "./leads.service";

interface IngestJobData {
  organizationId: string;
  importIds: string[];
}

@Injectable()
export class IngestWorker implements OnModuleInit {
  constructor(
    private readonly queue: QueueService,
    private readonly leads: LeadsService,
  ) {}

  onModuleInit() {
    this.queue.registerWorker<IngestJobData>("ingest", async (job) => {
      await this.leads.processBatch(job.data.organizationId, job.data.importIds);
    });
  }
}