import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { DedupService } from "./dedup.service";
import { IngestWorker } from "./ingest.worker";

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, DedupService, IngestWorker],
  exports: [LeadsService, DedupService],
})
export class LeadsModule {}