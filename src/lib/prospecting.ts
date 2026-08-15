import "server-only";
import { ensureAccessToken } from "@/lib/session";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

export class ProspectingApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface ProspectingLead {
  id: string;
  externalId: string | null;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  status: string;
  contactStatus: string | null;
  score: number | null;
  scoreTier: string | null;
  contacts: { type: string; value: string }[];
}

export interface ProspectingMessage {
  id: string;
  companyId: string;
  content: string;
  variant: string;
  status: string;
  length: number | null;
  createdAt: string;
}

export interface ChatLink {
  url: string;
  phone: string;
  snippet: string;
  opensNewWindow: boolean;
  note: string;
}

export type AnalysisStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "NEEDS_HUMAN_REVIEW"
  | "FAILED";

export interface AiAnalysisSummary {
  id: string;
  status: AnalysisStatus;
  model: string;
  promptVersion: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  elapsedMs: number | null;
  output: Record<string, unknown> | null;
}

export interface BackendImportContact {
  type: "WHATSAPP" | "INSTAGRAM" | "EMAIL" | "PHONE" | "LINKEDIN";
  value: string;
  isPrimary?: boolean;
}

export interface BackendImportItem {
  sourceKey: string;
  sourceUrl?: string | null;
  externalId?: string | null;
  collectedAt: string;
  purpose?: string | null;
  company: {
    name: string;
    category?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    website?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    rating?: number | null;
    reviewsCount?: number | null;
  };
  contacts: BackendImportContact[];
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE_URL) {
    throw new ProspectingApiError(
      "Configuração ausente: defina NEXT_PUBLIC_API_URL no .env",
      500,
    );
  }
  // Anexa o access token da sessão para autenticar no backend (guard NestJS).
  const accessToken = await ensureAccessToken();
  if (!accessToken) {
    throw new ProspectingApiError("Sessão expirada. Faça login novamente.", 401);
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Erro ${res.status} na API de prospecção`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      /* corpo não-JSON */
    }
    throw new ProspectingApiError(message, res.status);
  }
  return (await res.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchApi<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function listLeadsReady(status = "MESSAGE_APPROVED", pageSize = 100) {
  return fetchApi<{ data: ProspectingLead[]; total: number }>(
    `/leads?status=${encodeURIComponent(status)}&pageSize=${pageSize}`,
  );
}

export function listMessages(companyId: string) {
  return fetchApi<ProspectingMessage[]>(`/leads/${companyId}/messages`);
}

export function getChatLink(companyId: string, messageId: string) {
  return fetchApi<ChatLink>(`/leads/${companyId}/messages/${messageId}/chat-link`);
}

export function resolveByExternalId(externalId: string) {
  return fetchApi<{ id: string; name: string; status: string }>(
    `/leads/by-external/${encodeURIComponent(externalId)}`,
  );
}

export function enqueueAnalysis(companyId: string) {
  return postJson<{ jobId: string; status: string }>(
    `/leads/${companyId}/analyze`,
    {},
  );
}

export function getAnalysis(companyId: string) {
  return fetchApi<{
    lead: { id: string; name: string; status: string };
    analysis: AiAnalysisSummary | null;
  }>(`/leads/${companyId}/analyze`);
}

// ---------------------------------------------------------------------------
// Análise estruturada (findings/evidências auditáveis). Tipos compartilhados
// com o backend via @shared/analysis.
// ---------------------------------------------------------------------------

export interface AnalysisRunFindings {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
  requiresHumanReview: boolean;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  output: Record<string, unknown> | null;
  findings: import("@shared/analysis").FindingView[];
  recommendations: import("@shared/analysis").RecommendationView[];
  conflicts: import("@shared/analysis").ConflictView[];
}

export interface FindingsResponse {
  lead: { id: string; name: string };
  run: AnalysisRunFindings | null;
}

export function getFindings(companyId: string, runId?: string) {
  const q = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return fetchApi<FindingsResponse>(`/leads/${companyId}/findings${q}`);
}

export function importLeadsToBackend(items: BackendImportItem[]) {
  return postJson<{ accepted: number; enqueued: boolean }>("/leads/import", {
    items,
  });
}

export function approveMessage(companyId: string, messageId: string) {
  return postJson<{ status: string }>(
    `/leads/${companyId}/messages/${messageId}/approve`,
    {},
  );
}

export function markContacted(companyId: string) {
  return postJson<{ status: string }>(`/leads/${companyId}/mark-contacted`, {});
}

// ---------------------------------------------------------------------------
// Ciclo de vida de contato (máquina de estados). Abrir link / copiar NUNCA
// confirmam envio — apenas a confirmação explícita do operador.
// ---------------------------------------------------------------------------

export interface LifecycleTransitionResult {
  ok: boolean;
  idempotent?: boolean;
  from: string | null;
  to: string;
  action?: string;
  legacyStatus?: string;
  messageStatus?: string;
  messageId?: string;
  confirmedAt?: string;
  repliedAt?: string;
  optOutAt?: string;
}

export interface ContactAttemptRecord {
  id: string;
  leadId: string;
  messageId: string | null;
  channel: string;
  action: string;
  confirmedByUserId: string | null;
  confirmedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ContactLifecycleState {
  companyId: string;
  contactStatus: string;
  legacyStatus: string;
  contactedConfirmedAt: string | null;
  history: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    transition: string;
    actorId: string | null;
    messageId: string | null;
    createdAt: string;
  }[];
  attempts: ContactAttemptRecord[];
  events: { id: string; eventType: string; actorId: string | null; createdAt: string }[];
}

export function openChatLink(companyId: string, messageId: string) {
  return postJson<LifecycleTransitionResult>(`/leads/${companyId}/contact/chat-link/open`, {
    messageId,
  });
}

export function copyMessageAction(companyId: string, messageId: string) {
  return postJson<LifecycleTransitionResult>(`/leads/${companyId}/contact/copy`, { messageId });
}

export function confirmSend(companyId: string, messageId: string) {
  return postJson<LifecycleTransitionResult>(`/leads/${companyId}/contact/confirm-send`, {
    messageId,
  });
}

export function registerReply(companyId: string, content?: string) {
  return postJson<LifecycleTransitionResult>(`/leads/${companyId}/contact/reply`, { content });
}

export function registerOptOut(companyId: string, reason?: string) {
  return postJson<LifecycleTransitionResult>(`/leads/${companyId}/contact/opt-out`, { reason });
}

export function transitionStatus(companyId: string, to: string) {
  return postJson<LifecycleTransitionResult>(`/leads/${companyId}/contact/status`, { to });
}

export function getContactLifecycle(companyId: string) {
  return fetchApi<ContactLifecycleState>(`/leads/${companyId}/contact`);
}
