-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'ANALYZING', 'ANALYZED', 'MESSAGE_GENERATED', 'PENDING_APPROVAL', 'APPROVED', 'CHAT_LINK_OPENED', 'MESSAGE_COPIED', 'SEND_CONFIRMATION_PENDING', 'CONTACTED_CONFIRMED', 'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'CONVERTED', 'NOT_INTERESTED', 'LOST', 'OPT_OUT', 'BLOCKED', 'ARCHIVED', 'ERROR');

-- CreateEnum
CREATE TYPE "ContactAttemptAction" AS ENUM ('LINK_OPENED', 'MESSAGE_COPIED', 'SEND_CONFIRMED', 'REPLY_REGISTERED', 'OPT_OUT_REGISTERED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "contactStatus" "ContactStatus",
ADD COLUMN     "contactedConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "sentByUserId" TEXT;

-- CreateTable
CREATE TABLE "lead_status_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromStatus" "ContactStatus",
    "toStatus" "ContactStatus" NOT NULL,
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
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "messageId" TEXT,
    "channel" "ContactChannel" NOT NULL,
    "action" "ContactAttemptAction" NOT NULL,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT,
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

-- CreateIndex
CREATE INDEX "lead_status_history_companyId_createdAt_idx" ON "lead_status_history"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_status_history_organizationId_transition_createdAt_idx" ON "lead_status_history"("organizationId", "transition", "createdAt");

-- CreateIndex
CREATE INDEX "contact_attempts_leadId_action_createdAt_idx" ON "contact_attempts"("leadId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "contact_attempts_organizationId_channel_action_createdAt_idx" ON "contact_attempts"("organizationId", "channel", "action", "createdAt");

-- CreateIndex
CREATE INDEX "activity_events_companyId_createdAt_idx" ON "activity_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_events_organizationId_eventType_createdAt_idx" ON "activity_events"("organizationId", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
