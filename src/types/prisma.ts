export type LeadStatus =
  | "NOVO"
  | "CONTATADO"
  | "QUALIFICADO"
  | "PERDIDO"
  | "CONVERTIDO"
  | "ANALYZING"
  | "ANALYZED"
  | "MESSAGE_GENERATED"
  | "MESSAGE_PENDING_APPROVAL"
  | "MESSAGE_APPROVED"
  | "CHAT_LINK_OPENED"
  | "MESSAGE_COPIED"
  | "SEND_CONFIRMATION_PENDING"
  | "CONTACTED_CONFIRMED"
  | "REPLIED"
  | "MEETING_BOOKED"
  | "PROPOSAL_SENT"
  | "NOT_INTERESTED"
  | "LOST"
  | "OPT_OUT"
  | "BLOCKED"
  | "ERROR"
  | "ARCHIVED";

export type ContactChannel =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "EMAIL"
  | "PHONE"
  | "LINKEDIN";

export type MessageStatus =
  | "DRAFT"
  | "APPROVED"
  | "SENT"
  | "FAILED";

export type MessageDirection =
  | "OUTBOUND"
  | "INBOUND";

export type TaskType =
  | "REVIEW_APPROVAL"
  | "FOLLOW_UP"
  | "RESPONSE_TRIAGE"
  | "SITE_RECHECK"
  | "DATA_FIX";

export type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELLED"
  | "OVERDUE";

export type WebsiteStatus =
  | "NO_WEBSITE"
  | "ACTIVE"
  | "UNREACHABLE"
  | "PARKED"
  | "UNKNOWN";

export type ScoreTier =
  | "HIGH"
  | "MEDIUM"
  | "NURTURE"
  | "LOW";

export type AnalysisStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "NEEDS_HUMAN_REVIEW"
  | "FAILED";

export type SocialPlatform =
  | "INSTAGRAM"
  | "LINKEDIN"
  | "FACEBOOK"
  | "OTHER";

export type ConsentStatus =
  | "NOT_APPLICABLE"
  | "GRANTED"
  | "DENIED"
  | "WITHDRAWN"
  | "IMPLIED";

export type LegalBasis =
  | "LEGITIMATE_INTEREST"
  | "CONTRACT"
  | "CONSENT"
  | "PUBLIC_INFO"
  | "NO_BASIS";

export type SourceClass =
  | "OFFICIAL_API"
  | "LICENSED"
  | "PUBLIC"
  | "SCRAPED"
  | "FIRST_PARTY"
  | "USER_PROVIDED";

export type ImportStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

export type DedupResult =
  | "NEW"
  | "DUPLICATE_EXACT"
  | "DUPLICATE_SUGGESTED"
  | "CONFLICT";

export type FindingCategory =
  | "FACT"
  | "INFERENCE"
  | "UNKNOWN"
  | "RISK";

export type FindingValueType =
  | "STRING"
  | "NUMBER"
  | "BOOLEAN"
  | "URL"
  | "METRIC"
  | "JSON";

export type EvidenceSourceType =
  | "WEBSITE_HTTP"
  | "HTML_ANALYSIS"
  | "LIGHTHOUSE"
  | "PAGESPEED"
  | "DNS"
  | "SOCIAL_PUBLIC"
  | "USER_INPUT"
  | "AI_INFERENCE";

export type EvidenceType =
  | "HTML_ELEMENT"
  | "TEXT"
  | "METRIC"
  | "SCREENSHOT"
  | "EXTERNAL_DOC"
  | "USER_INPUT";

export interface Lead {
  id: string;
  externalId: string | null;
  name: string;
  nameNormalized: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phoneE164: string | null;
  canonicalDomain: string | null;
  rating: number | null;
  reviewsCount: number | null;
  websiteStatus: WebsiteStatus;
  status: LeadStatus;
  contactStatus: LeadStatus | null;
  contactedConfirmedAt: string | null;
  dataOrigin: string;
  sourceUrl: string | null;
  collectedAt: string;
  legalBasis: LegalBasis;
  purpose: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadContact {
  id: string;
  leadId: string;
  type: ContactChannel;
  value: string;
  valueNormalized: string;
  isPrimary: boolean;
  isValid: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
  sourceKey: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LeadImport {
  id: string;
  sourceKey: string;
  externalId: string | null;
  leadName: string;
  rawPayload: unknown;
  collectedAt: string;
  ingestedAt: string;
  purpose: string | null;
  dedupResult: DedupResult | null;
  dedupReason: string | null;
  matchedLeadId: string | null;
  status: ImportStatus;
  error: string | null;
}

export interface LeadWebsite {
  id: string;
  leadId: string;
  url: string;
  domain: string;
  status: WebsiteStatus;
  lastFetchedAt: string | null;
  httpStatus: number | null;
  isHttps: boolean | null;
  tlsValid: boolean | null;
  hasRobots: boolean | null;
  redirectTo: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface WebsiteAudit {
  id: string;
  websiteId: string;
  tool: string;
  auditedAt: string;
  metrics: unknown;
  checks: unknown;
  errors: string[];
  raw: unknown | null;
}

export interface SocialProfile {
  id: string;
  leadId: string;
  platform: SocialPlatform;
  handle: string;
  url: string | null;
  discoveredAt: string;
  isOfficial: boolean | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LeadScore {
  id: string;
  leadId: string;
  score: number;
  tier: ScoreTier;
  components: unknown;
  calculatedAt: string;
  calculatedBy: string;
  rationale: string | null;
}

export interface AnalysisRun {
  id: string;
  leadId: string;
  provider: string;
  model: string;
  promptVersion: string;
  inputSnapshot: unknown;
  output: unknown;
  requiresHumanReview: boolean;
  status: AnalysisStatus;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface AnalysisFinding {
  id: string;
  leadId: string;
  analysisRunId: string;
  category: FindingCategory;
  claim: string;
  value: unknown | null;
  valueType: FindingValueType;
  sourceType: EvidenceSourceType;
  confidence: number | null;
  requiresHumanReview: boolean;
  messageEligible: boolean;
  createdAt: string;
}

export interface AnalysisEvidence {
  id: string;
  findingId: string;
  url: string | null;
  evidenceType: EvidenceType;
  sourceType: EvidenceSourceType;
  selector: string | null;
  extractedText: string | null;
  metricName: string | null;
  metricValue: number | null;
  screenshotReference: string | null;
  collectedAt: string;
  hash: string;
}

export interface AnalysisRecommendation {
  id: string;
  leadId: string;
  analysisRunId: string;
  kind: string;
  title: string;
  description: string | null;
  confidence: number | null;
  priority: string | null;
  requiresHumanReview: boolean;
  createdAt: string;
}

export interface AnalysisConflict {
  id: string;
  analysisRunId: string;
  fromFindingId: string;
  toFindingId: string;
  nature: string;
  resolution: string | null;
  createdAt: string;
}

export interface MessageDraft {
  id: string;
  leadId: string;
  channel: ContactChannel;
  status: MessageStatus;
  direction: MessageDirection;
  content: string;
  contentHash: string;
  externalMessageId: string | null;
  externalStatus: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  providerConfig: unknown | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sentBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuppressionList {
  id: string;
  leadId: string | null;
  contact: string | null;
  channel: ContactChannel;
  reason: string;
  sourceKey: string;
  createdAt: string;
  expiresAt: string | null;
  note: string | null;
}

export interface Task {
  id: string;
  leadId: string | null;
  type: TaskType;
  status: TaskStatus;
  dueAt: string | null;
  completedAt: string | null;
  payload: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactStatusHistory {
  id: string;
  leadId: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  transition: string;
  actorId: string | null;
  actorType: string;
  messageId: string | null;
  channel: ContactChannel | null;
  metadata: unknown | null;
  createdAt: string;
}

export interface ContactAttempt {
  id: string;
  leadId: string;
  messageId: string | null;
  channel: ContactChannel;
  action: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  metadata: unknown | null;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  leadId: string | null;
  messageId: string | null;
  actorId: string | null;
  actorType: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  channel: ContactChannel | null;
  payload: unknown | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface Setting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiUsageEvent {
  id: string;
  feature: string;
  provider: string;
  model: string;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  estimatedCost: number | null;
  success: boolean;
  error: string | null;
  createdAt: string;
}

export interface JobFailure {
  id: string;
  queue: string;
  jobId: string;
  jobName: string;
  error: string;
  attemptsMade: number;
  maxAttempts: number;
  payload: unknown;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}