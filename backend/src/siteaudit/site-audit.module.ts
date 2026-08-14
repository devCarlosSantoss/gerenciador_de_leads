import { Module } from "@nestjs/common";
import { SiteAuditService } from "./site-audit.service";

@Module({
  providers: [SiteAuditService],
  exports: [SiteAuditService],
})
export class SiteAuditModule {}