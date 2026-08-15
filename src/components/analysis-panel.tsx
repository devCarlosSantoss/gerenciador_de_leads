"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  Clock,
  XCircle,
  ListChecks,
  MessageSquareText,
} from "lucide-react";
import type { AnalysisStatus } from "@/lib/prospecting";

interface StructuredFinding {
  id: string;
  category: "fact" | "inference" | "unknown" | "risk";
  claim: string;
  value?: string | number | boolean;
  valueType?: "string" | "number" | "boolean" | "url" | "metric";
  sourceType: string;
  confidence?: number;
  requiresHumanReview?: boolean;
  evidence?: Array<{
    sourceType: string;
    url?: string;
    evidenceType: string;
    selector?: string;
    extractedText?: string;
    metricName?: string;
    metricValue?: number;
    screenshotReference?: string;
  }>;
}

interface StructuredOpportunity {
  title: string;
  description?: string;
  confidence?: number;
  priority?: "high" | "medium" | "low";
  evidenceFindingIds?: string[];
}

export interface AnalysisOutput {
  company_summary?: string;
  business_segment?: string;
  lead_score?: number;
  contact_recommendation?: string;
  recommended_approach?: string;
  target_fit?: { score?: number; reason?: string };
  website_quality?: {
    score?: number;
    evidence?: string[];
    critical_issues?: string[];
    minor_issues?: string[];
    unknowns?: string[];
  };
  business_opportunities?: { service?: string; reason?: string; confidence?: string }[];
  personalization_points?: string[];
  risks?: string[] | StructuredFinding[];
  suggested_message?: string;
  message_reasoning?: string;
  facts?: StructuredFinding[];
  inferences?: StructuredFinding[];
  unknowns?: StructuredFinding[];
  opportunities?: StructuredOpportunity[];
  message_eligible_findings?: string[];
  requires_human_review?: boolean;
}

export interface PanelData {
  migrated: boolean;
  company: { id: string; name: string; status: string } | null;
  analysis: {
    id: string;
    status: AnalysisStatus;
    model: string;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    error: string | null;
    elapsedMs: number | null;
    output: Record<string, unknown> | null;
  } | null;
}

const STATUS_META: Record<
  AnalysisStatus,
  { label: string; badge: string; dot: string }
> = {
  QUEUED: {
    label: "Na fila",
    badge: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  RUNNING: {
    label: "Em análise",
    badge: "bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500 animate-pulse",
  },
  COMPLETED: {
    label: "Concluída",
    badge: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  PARTIAL: {
    label: "Parcial",
    badge: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  NEEDS_HUMAN_REVIEW: {
    label: "Revisão humana",
    badge: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  FAILED: {
    label: "Falhou",
    badge: "bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
};

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnalysisPanel({
  leadId,
  initial,
  initialError = "",
}: {
  leadId: string;
  initial: PanelData | null;
  initialError?: string;
}) {
  const [data, setData] = useState<PanelData | null>(initial);
  const [error, setError] = useState(initialError);

  const analysis = data?.analysis ?? null;
  const inProgress =
    analysis?.status === "QUEUED" || analysis?.status === "RUNNING";

  async function load() {
    try {
      const res = await fetch(`/api/leads/${leadId}/analysis`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Erro ao carregar análise");
      setData(body);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar análise");
    }
  }

  // Enquanto a análise estiver em andamento, atualiza o progresso a cada 5s.
  useEffect(() => {
    if (!inProgress) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgress]);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p>{error}</p>
        <button
          className="mt-2 font-medium text-rose-800 hover:underline"
          onClick={load}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando análise...
      </div>
    );
  }

  if (!data.migrated || !data.company) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="flex items-start gap-2">
          <AlertTriangleIcon />
          Este lead ainda não foi migrado para o sistema de IA. Selecione-o na
          listagem e clique em{" "}
          <strong className="font-semibold">Analisar com IA</strong> — ele será
          migrado e analisado automaticamente.
        </p>
      </div>
    );
  }

  const a = analysis;
  if (!a) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Nenhuma análise ainda. Selecione o lead na listagem e clique em{" "}
        <strong className="font-semibold">Analisar com IA</strong>.
      </div>
    );
  }

  const meta = STATUS_META[a.status] ?? STATUS_META.QUEUED;
  const out = (a.output ?? {}) as AnalysisOutput;
  const displayMs =
    a.status === "QUEUED" || a.status === "RUNNING" ? a.elapsedMs : a.durationMs;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-900">Análise com IA</h2>
        </div>
        <div className="flex items-center gap-2">
          {inProgress && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
          <span className={`badge ring-1 ring-inset ${meta.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Modelo</dt>
          <dd className="mt-0.5 font-medium text-slate-800">
            {a.model === "pending" ? "—" : a.model}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Início</dt>
          <dd className="mt-0.5 font-medium text-slate-800">
            {formatTime(a.startedAt ?? a.createdAt)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Duração</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-medium text-slate-800">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            {formatDuration(displayMs)}
            {inProgress ? " (decorrido)" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Lead score</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {typeof out.lead_score === "number" ? `${out.lead_score}/100` : "—"}
          </dd>
        </div>
      </dl>

      {a.status === "FAILED" && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {a.error ?? "A análise falhou. Tente novamente."}
        </div>
      )}

      {inProgress && (
        <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <p className="flex items-center gap-2">
            <ActivityIcon />
            {a.status === "QUEUED"
              ? "Análise na fila, aguardando o processador..."
              : "Analisando o lead com a IA (auditoria do site + geração da análise)..."}
          </p>
          <p className="mt-1 text-xs text-indigo-600">
            Esta página atualiza automaticamente a cada 5 segundos.
          </p>
        </div>
      )}

      {!inProgress && a.status !== "FAILED" && (
        <AnalysisResult output={out} model={a.model} durationMs={a.durationMs} raw={a.output} />
      )}
    </div>
  );
}

function AnalysisResult({
  output,
  model,
  durationMs,
  raw,
}: {
  output: AnalysisOutput;
  model: string;
  durationMs: number | null;
  raw: Record<string, unknown> | null;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="mt-4 space-y-4 text-sm">
      {output.company_summary && <p className="text-slate-700">{output.company_summary}</p>}

      {typeof output.lead_score === "number" && (
        <div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Pontuação do lead</span>
            <span>{output.lead_score}/100</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.max(0, Math.min(100, output.lead_score))}%` }}
            />
          </div>
        </div>
      )}

      {output.contact_recommendation && (
        <div className="flex flex-wrap gap-2">
          <span className="badge bg-slate-100 text-slate-700">
            Recomendação: {labelRecommendation(output.contact_recommendation)}
          </span>
          {output.website_quality?.score != null && (
            <span className="badge bg-slate-100 text-slate-700">
              Qualidade do site: {output.website_quality.score}/100
            </span>
          )}
        </div>
      )}

      {output.recommended_approach && (
        <Section title="Abordagem recomendada">
          <p className="text-slate-700">{output.recommended_approach}</p>
        </Section>
      )}

      {output.business_opportunities && output.business_opportunities.length > 0 && (
        <Section title="Oportunidades">
          <ul className="space-y-2">
            {output.business_opportunities.map((op, i) => (
              <li key={i} className="flex items-start gap-2">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <div>
                  <span className="font-medium text-slate-800">
                    {op.service}
                    {op.confidence ? ` (${op.confidence})` : ""}
                  </span>
                  {op.reason && <p className="text-slate-600">{op.reason}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {output.risks && output.risks.length > 0 && (
        <Section title="Riscos">
          <ul className="list-inside list-disc space-y-1 text-slate-700">
            {output.risks.map((r, i) => (
              <li key={i}>
                {typeof r === "string" ? r : r.claim}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {output.facts && output.facts.length > 0 && (
        <Section title="Fatos verificados">
          <ul className="space-y-2">
            {output.facts.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="badge bg-emerald-50 text-emerald-700 shrink-0">Fato</span>
                <div>
                  <p className="text-slate-800">{f.claim}</p>
                  {f.evidence && f.evidence.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {f.evidence.map((e, j) => (
                        <span key={j} className="mr-2">
                          {e.url ? (
                            <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline">
                              {e.selector ?? "evidência"}
                            </a>
                          ) : (
                            e.extractedText ?? e.metricName ?? "evidência"
                          )}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {output.inferences && output.inferences.length > 0 && (
        <Section title="Inferências">
          <ul className="space-y-2">
            {output.inferences.map((inf, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="badge bg-indigo-50 text-indigo-700 shrink-0">
                  Inferência {typeof inf.confidence === "number" ? `(${Math.round(inf.confidence * 100)}%)` : ""}
                </span>
                <div>
                  <p className="text-slate-800">{inf.claim}</p>
                  {inf.evidence && inf.evidence.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {inf.evidence.map((e, j) => (
                        <span key={j} className="mr-2">
                          {e.url ? (
                            <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline">
                              {e.selector ?? "evidência"}
                            </a>
                          ) : (
                            e.extractedText ?? e.metricName ?? "evidência"
                          )}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {output.unknowns && output.unknowns.length > 0 && (
        <Section title="Desconhecidos">
          <ul className="list-inside list-disc space-y-1 text-slate-700">
            {output.unknowns.map((u, i) => (
              <li key={i} className="text-slate-600">{u.claim}</li>
            ))}
          </ul>
        </Section>
      )}

      {output.opportunities && output.opportunities.length > 0 && (
        <Section title="Oportunidades identificadas">
          <ul className="space-y-2">
            {output.opportunities.map((op, i) => (
              <li key={i} className="flex items-start gap-2">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <div>
                  <span className="font-medium text-slate-800">
                    {op.title}
                    {op.confidence != null ? ` (${Math.round(op.confidence * 100)}%)` : ""}
                    {op.priority ? ` [${op.priority}]` : ""}
                  </span>
                  {op.description && <p className="text-slate-600">{op.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {output.suggested_message && (
        <Section title="Mensagem sugerida">
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800">
            {output.suggested_message}
          </p>
          {output.message_reasoning && (
            <p className="mt-2 text-xs text-slate-500">
              <MessageSquareText className="mr-1 inline h-3.5 w-3.5" />
              {output.message_reasoning}
            </p>
          )}
        </Section>
      )}

      <button
        className="text-xs font-medium text-indigo-600 hover:underline"
        onClick={() => setShowRaw((v) => !v)}
      >
        {showRaw ? "Ocultar JSON completo" : "Ver JSON completo da análise"}
      </button>
      {showRaw && (
        <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 px-4 py-3 text-xs text-slate-100">
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}

      <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
        Análise concluída por {model} em {formatDuration(durationMs)}.
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

function AlertTriangleIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function labelRecommendation(value: string): string {
  const map: Record<string, string> = {
    do_not_contact: "Não contatar",
    manual_review: "Revisão manual",
    draft_only: "Somente rascunho",
    eligible_for_official_flow: "Elegível para envio",
  };
  return map[value] ?? value;
}