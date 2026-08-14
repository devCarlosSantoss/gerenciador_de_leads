import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { AuditModule } from "./audit/audit.module";
import { AiModule } from "./ai/ai.module";
import { HealthModule } from "./health/health.module";
import { LeadsModule } from "./leads/leads.module";
import { SiteAuditModule } from "./siteaudit/site-audit.module";
import { AnalysisModule } from "./analysis/analysis.module";
import { MessagesModule } from "./messages/messages.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { ContactModule } from "./contact/contact.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { ScoringModule } from "./scoring/scoring.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    QueueModule,
    AuditModule,
    AiModule,
    HealthModule,
    LeadsModule,
    SiteAuditModule,
    AnalysisModule,
    MessagesModule,
    ComplianceModule,
    ContactModule,
    WebhooksModule,
    ScoringModule,
  ],
  providers: [
    // Guard global: tudo é autenticado por padrão; rotas públicas usam @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}