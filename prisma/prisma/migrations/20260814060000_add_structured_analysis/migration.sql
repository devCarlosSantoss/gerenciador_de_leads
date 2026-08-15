-- Análise estruturada, verificável e auditável.
-- Renomeia a tabela de execuções (preservando o histórico) e cria os modelos
-- de findings, evidências, recomendações e conflitos.

-- 1. Renomear a tabela de runs preservando as linhas existentes
ALTER TABLE "AiAnalysis" RENAME TO "analysis_runs";

-- 2. Ajustar colunas da nova analysis_runs
ALTER TABLE "analysis_runs" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "analysis_runs" ADD COLUMN "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "analysis_runs" DROP COLUMN "facts";
ALTER TABLE "analysis_runs" DROP COLUMN "inferences";
ALTER TABLE "analysis_runs" DROP COLUMN "unknowns";

DROP INDEX IF EXISTS "AiAnalysis_companyId_idx";
DROP INDEX IF EXISTS "AiAnalysis_organizationId_status_idx";
CREATE INDEX "analysis_runs_companyId_createdAt_idx" ON "analysis_runs"("companyId", "createdAt");
CREATE INDEX "analysis_runs_organizationId_status_idx" ON "analysis_runs"("organizationId", "status");

-- 3. Enums
CREATE TYPE "FindingCategory" AS ENUM ('FACT', 'INFERENCE', 'UNKNOWN', 'RISK');
CREATE TYPE "FindingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'URL', 'METRIC', 'JSON');
CREATE TYPE "EvidenceSourceType" AS ENUM (
  'WEBSITE_HTTP',
  'HTML_ANALYSIS',
  'LIGHTHOUSE',
  'PAGESPEED',
  'DNS',
  'SOCIAL_PUBLIC',
  'USER_INPUT',
  'AI_INFERENCE'
);
CREATE TYPE "EvidenceType" AS ENUM (
  'HTML_ELEMENT',
  'TEXT',
  'METRIC',
  'SCREENSHOT',
  'EXTERNAL_DOC',
  'USER_INPUT'
);

-- 4. analysis_findings
CREATE TABLE "analysis_findings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
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
CREATE INDEX "analysis_findings_leadId_category_idx" ON "analysis_findings"("leadId", "category");
CREATE INDEX "analysis_findings_analysisRunId_idx" ON "analysis_findings"("analysisRunId");
ALTER TABLE "analysis_findings"
  ADD CONSTRAINT "analysis_findings_analysisRunId_fkey"
  FOREIGN KEY ("analysisRunId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. analysis_evidence
CREATE TABLE "analysis_evidence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
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
CREATE INDEX "analysis_evidence_findingId_idx" ON "analysis_evidence"("findingId");
ALTER TABLE "analysis_evidence"
  ADD CONSTRAINT "analysis_evidence_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "analysis_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. analysis_recommendations
CREATE TABLE "analysis_recommendations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
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
CREATE INDEX "analysis_recommendations_leadId_kind_idx" ON "analysis_recommendations"("leadId", "kind");
ALTER TABLE "analysis_recommendations"
  ADD CONSTRAINT "analysis_recommendations_analysisRunId_fkey"
  FOREIGN KEY ("analysisRunId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. analysis_conflicts
CREATE TABLE "analysis_conflicts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "analysisRunId" TEXT NOT NULL,
  "fromFindingId" TEXT NOT NULL,
  "toFindingId" TEXT NOT NULL,
  "nature" TEXT NOT NULL,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analysis_conflicts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analysis_conflicts_analysisRunId_idx" ON "analysis_conflicts"("analysisRunId");
ALTER TABLE "analysis_conflicts"
  ADD CONSTRAINT "analysis_conflicts_analysisRunId_fkey"
  FOREIGN KEY ("analysisRunId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_conflicts"
  ADD CONSTRAINT "analysis_conflicts_fromFindingId_fkey"
  FOREIGN KEY ("fromFindingId") REFERENCES "analysis_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_conflicts"
  ADD CONSTRAINT "analysis_conflicts_toFindingId_fkey"
  FOREIGN KEY ("toFindingId") REFERENCES "analysis_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;