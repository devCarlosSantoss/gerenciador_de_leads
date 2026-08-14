import { Module } from "@nestjs/common";
import { SiteAuditModule } from "../siteaudit/site-audit.module";
import { ScoringModule } from "../scoring/scoring.module";
import { MessagesModule } from "../messages/messages.module";
import { ContactModule } from "../contact/contact.module";
import { AnalysisService } from "./analysis.service";
import { AnalysisWorker } from "./analysis.worker";
import { AnalysisController } from "./analysis.controller";
import { FindingsController } from "./findings.controller";
import { FindingsService } from "./findings.service";

@Module({
  imports: [SiteAuditModule, ScoringModule, MessagesModule, ContactModule],
  controllers: [AnalysisController, FindingsController],
  providers: [AnalysisService, AnalysisWorker, FindingsService],
  exports: [AnalysisService, FindingsService],
})
export class AnalysisModule {}