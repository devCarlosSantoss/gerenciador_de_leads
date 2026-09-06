-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ANALYZING', 'ANALYZED', 'MESSAGE_GENERATED', 'MESSAGE_PENDING_APPROVAL', 'MESSAGE_APPROVED', 'CHAT_LINK_OPENED', 'MESSAGE_COPIED', 'SEND_CONFIRMATION_PENDING', 'CONTACTED_CONFIRMED', 'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'CONVERTED', 'NOT_INTERESTED', 'LOST', 'OPT_OUT', 'BLOCKED', 'ERROR', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'EMAIL', 'PHONE', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('REVIEW_APPROVAL', 'FOLLOW_UP', 'RESPONSE_TRIAGE', 'SITE_RECHECK', 'DATA_FIX');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('NO_WEBSITE', 'ACTIVE', 'UNREACHABLE', 'PARKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ScoreTier" AS ENUM ('HIGH', 'MEDIUM', 'NURTURE', 'LOW');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'NEEDS_HUMAN_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'LINKEDIN', 'FACEBOOK', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('NOT_APPLICABLE', 'GRANTED', 'DENIED', 'WITHDRAWN', 'IMPLIED');

-- CreateEnum
CREATE TYPE "LegalBasis" AS ENUM ('LEGITIMATE_INTEREST', 'CONTRACT', 'CONSENT', 'PUBLIC_INFO', 'NO_BASIS');

-- CreateEnum
CREATE TYPE "SourceClass" AS ENUM ('OFFICIAL_API', 'LICENSED', 'PUBLIC', 'SCRAPED', 'FIRST_PARTY', 'USER_PROVIDED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "DedupResult" AS ENUM ('NEW', 'DUPLICATE_EXACT', 'DUPLICATE_SUGGESTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('FACT', 'INFERENCE', 'UNKNOWN', 'RISK');

-- CreateEnum
CREATE TYPE "FindingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'URL', 'METRIC', 'JSON');

-- CreateEnum
CREATE TYPE "EvidenceSourceType" AS ENUM ('WEBSITE_HTTP', 'HTML_ANALYSIS', 'LIGHTHOUSE', 'PAGESPEED', 'DNS', 'SOCIAL_PUBLIC', 'USER_INPUT', 'AI_INFERENCE');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('HTML_ELEMENT', 'TEXT', 'METRIC', 'SCREENSHOT', 'EXTERNAL_DOC', 'USER_INPUT');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT,
    "category" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" CHAR(2),
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phoneE164" TEXT,
    "canonicalDomain" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "websiteStatus" "WebsiteStatus" NOT NULL DEFAULT 'UNKNOWN',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "contactStatus" "LeadStatus",
    "contactedConfirmedAt" TIMESTAMP(3),
    "dataOrigin" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "legalBasis" "LegalBasis" NOT NULL DEFAULT 'NO_BASIS',
    "purpose" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadContact" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "ContactChannel" NOT NULL,
    "value" TEXT NOT NULL,
    "valueNormalized" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeadContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadImport" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT,
    "leadName" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT,
    "dedupResult" "DedupResult",
    "dedupReason" TEXT,
    "matchedLeadId" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,

    CONSTRAINT "LeadImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadWebsite" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "WebsiteStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastFetchedAt" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "isHttps" BOOLEAN,
    "tlsValid" BOOLEAN,
    "hasRobots" BOOLEAN,
    "redirectTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeadWebsite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteAudit" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "auditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,
    "checks" JSONB NOT NULL,
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw" JSONB,

    CONSTRAINT "WebsiteAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialProfile" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOfficial" BOOLEAN,
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SocialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "tier" "ScoreTier" NOT NULL,
    "components" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedBy" TEXT NOT NULL,
    "rationale" TEXT,

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'unknown',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'COMPLETED',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_findings" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "claim" TEXT NOT NULL,
    "value" JSONB,
    "valueType" "FindingValueType" NOT NULL,
    "sourceType" "EvidenceSourceType" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "messageEligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_evidence" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "url" TEXT,
    "evidenceType" "EvidenceType" NOT NULL,
    "sourceType" "EvidenceSourceType" NOT NULL,
    "selector" TEXT,
    "extractedText" TEXT,
    "metricName" TEXT,
    "metricValue" DOUBLE PRECISION,
    "screenshotReference" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hash" TEXT NOT NULL,

    CONSTRAINT "analysis_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_recommendations" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "confidence" DOUBLE PRECISION,
    "priority" TEXT,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_conflicts" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "fromFindingId" TEXT NOT NULL,
    "toFindingId" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDraft" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "ContactChannel" NOT NULL DEFAULT 'WHATSAPP',
    "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "externalStatus" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "providerConfig" JSONB,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionList" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "contact" TEXT,
    "channel" "ContactChannel" NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "SuppressionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_status_history" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStatus" "LeadStatus",
    "toStatus" "LeadStatus" NOT NULL,
    "transition" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "messageId" TEXT,
    "channel" "ContactChannel",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_attempts" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "messageId" TEXT,
    "channel" "ContactChannel" NOT NULL,
    "action" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "messageId" TEXT,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "channel" "ContactChannel",
    "payload" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFailure" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "attemptsMade" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "JobFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_externalId_key" ON "Lead"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_phoneE164_key" ON "Lead"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_canonicalDomain_key" ON "Lead"("canonicalDomain");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_city_state_idx" ON "Lead"("city", "state");

-- CreateIndex
CREATE INDEX "Lead_nameNormalized_idx" ON "Lead"("nameNormalized");

-- CreateIndex
CREATE INDEX "Lead_canonicalDomain_idx" ON "Lead"("canonicalDomain");

-- CreateIndex
CREATE INDEX "Lead_phoneE164_idx" ON "Lead"("phoneE164");

-- CreateIndex
CREATE INDEX "Lead_externalId_idx" ON "Lead"("externalId");

-- CreateIndex
CREATE INDEX "LeadContact_leadId_idx" ON "LeadContact"("leadId");

-- CreateIndex
CREATE INDEX "LeadContact_isValid_isVerified_idx" ON "LeadContact"("isValid", "isVerified");

-- CreateIndex
CREATE UNIQUE INDEX "LeadContact_type_valueNormalized_key" ON "LeadContact"("type", "valueNormalized");

-- CreateIndex
CREATE INDEX "LeadImport_sourceKey_collectedAt_idx" ON "LeadImport"("sourceKey", "collectedAt");

-- CreateIndex
CREATE INDEX "LeadImport_matchedLeadId_idx" ON "LeadImport"("matchedLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadWebsite_domain_key" ON "LeadWebsite"("domain");

-- CreateIndex
CREATE INDEX "LeadWebsite_leadId_idx" ON "LeadWebsite"("leadId");

-- CreateIndex
CREATE INDEX "WebsiteAudit_websiteId_idx" ON "WebsiteAudit"("websiteId");

-- CreateIndex
CREATE INDEX "WebsiteAudit_auditedAt_idx" ON "WebsiteAudit"("auditedAt");

-- CreateIndex
CREATE INDEX "SocialProfile_leadId_idx" ON "SocialProfile"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialProfile_platform_handle_key" ON "SocialProfile"("platform", "handle");

-- CreateIndex
CREATE INDEX "LeadScore_leadId_idx" ON "LeadScore"("leadId");

-- CreateIndex
CREATE INDEX "LeadScore_score_idx" ON "LeadScore"("score");

-- CreateIndex
CREATE INDEX "analysis_runs_leadId_createdAt_idx" ON "analysis_runs"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "analysis_runs_status_idx" ON "analysis_runs"("status");

-- CreateIndex
CREATE INDEX "analysis_findings_leadId_category_idx" ON "analysis_findings"("leadId", "category");

-- CreateIndex
CREATE INDEX "analysis_findings_analysisRunId_idx" ON "analysis_findings"("analysisRunId");

-- CreateIndex
CREATE INDEX "analysis_evidence_findingId_idx" ON "analysis_evidence"("findingId");

-- CreateIndex
CREATE INDEX "analysis_recommendations_leadId_kind_idx" ON "analysis_recommendations"("leadId", "kind");

-- CreateIndex
CREATE INDEX "analysis_conflicts_analysisRunId_idx" ON "analysis_conflicts"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDraft_externalMessageId_key" ON "MessageDraft"("externalMessageId");

-- CreateIndex
CREATE INDEX "MessageDraft_leadId_idx" ON "MessageDraft"("leadId");

-- CreateIndex
CREATE INDEX "MessageDraft_status_idx" ON "MessageDraft"("status");

-- CreateIndex
CREATE INDEX "SuppressionList_contact_idx" ON "SuppressionList"("contact");

-- CreateIndex
CREATE INDEX "SuppressionList_leadId_idx" ON "SuppressionList"("leadId");

-- CreateIndex
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");

-- CreateIndex
CREATE INDEX "lead_status_history_leadId_createdAt_idx" ON "lead_status_history"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_status_history_transition_createdAt_idx" ON "lead_status_history"("transition", "createdAt");

-- CreateIndex
CREATE INDEX "contact_attempts_leadId_action_createdAt_idx" ON "contact_attempts"("leadId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "contact_attempts_channel_action_createdAt_idx" ON "contact_attempts"("channel", "action", "createdAt");

-- CreateIndex
CREATE INDEX "activity_events_leadId_createdAt_idx" ON "activity_events"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_events_eventType_createdAt_idx" ON "activity_events"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "AiUsageEvent_feature_createdAt_idx" ON "AiUsageEvent"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_provider_model_createdAt_idx" ON "AiUsageEvent"("provider", "model", "createdAt");

-- CreateIndex
CREATE INDEX "JobFailure_queue_createdAt_idx" ON "JobFailure"("queue", "createdAt");

-- CreateIndex
CREATE INDEX "JobFailure_jobId_idx" ON "JobFailure"("jobId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadWebsite" ADD CONSTRAINT "LeadWebsite_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteAudit" ADD CONSTRAINT "WebsiteAudit_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "LeadWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_findings" ADD CONSTRAINT "analysis_findings_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_evidence" ADD CONSTRAINT "analysis_evidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "analysis_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_recommendations" ADD CONSTRAINT "analysis_recommendations_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_conflicts" ADD CONSTRAINT "analysis_conflicts_fromFindingId_fkey" FOREIGN KEY ("fromFindingId") REFERENCES "analysis_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_conflicts" ADD CONSTRAINT "analysis_conflicts_toFindingId_fkey" FOREIGN KEY ("toFindingId") REFERENCES "analysis_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_conflicts" ADD CONSTRAINT "analysis_conflicts_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionList" ADD CONSTRAINT "SuppressionList_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessageDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessageDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
