import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { AiModule } from "./ai/ai.module";
import { HealthModule } from "./health/health.module";
import { LeadsModule } from "./leads/leads.module";
import { SiteAuditModule } from "./siteaudit/site-audit.module";
import { AnalysisModule } from "./analysis/analysis.module";
import { MessagesModule } from "./messages/messages.module";
import { ContactModule } from "./contact/contact.module";
import { ScoringModule } from "./scoring/scoring.module";
import { AuthModule } from "./auth/auth.module";
import { PersonalAuthGuard } from "./auth/personal-auth.guard";

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    QueueModule,
    AiModule,
    HealthModule,
    LeadsModule,
    SiteAuditModule,
    AnalysisModule,
    MessagesModule,
    ContactModule,
    ScoringModule,
  ],
  providers: [
    // Guard global: tudo é autenticado por padrão; rotas públicas usam @Public().
    { provide: APP_GUARD, useClass: PersonalAuthGuard },
  ],
})
export class AppModule {}