"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Link2,
  Braces,
  Scale,
  CircleDot,
  Crosshair,
  ClipboardCheck,
  UserRound,
} from "lucide-react";
import type { FindingsResponse } from "@/lib/prospecting";
import {
  FINDING_CATEGORY_LABELS,
  SOURCE_TYPE_LABELS,
  type FindingCategory,
  type EvidenceView,
  type FindingView,
} from "@shared/analysis";

const CATEGORY_ORDER: FindingCategory[] = ["FACT", "INFERENCE", "UNKNOWN", "RISK"];

const CATEGORY_BADGE: Record<FindingCategory, string> = {
  FACT: "bg-emerald-50 text-emerald-700",
  INFERENCE: "bg-sky-50 text-sky-700",
  UNKNOWN: "bg-slate-100 text-slate-600",
  RISK: "bg-rose-50 text-rose-700",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function shortHash(hash: string | undefined): string {
  if (!hash) return "";
  return `${hash.slice(0, 10)}…${hash.slice(-4)}`;
}

export function FindingsPanel({
  leadId,
  initialError = "",
}: {
  leadId: string;
  initialError?: string;
}) {
  const [data, setData] = useState<FindingsResponse | null>(null);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(!initialError);

  async function fetchFindings(): Promise<FindingsResponse> {
    const res = await fetch(`/api/leads/${leadId}/findings`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? "Erro ao carregar findings");
    return body;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await fetchFindings();
        if (!cancelled) {
          setData(body);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar findings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setData(await fetchFindings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar findings");
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p>{error}</p>
        <button
          className="mt-2 font-medium text-rose-800 hover:underline"
          onClick={reload}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando findings da análise...
      </div>
    );
  }

  if (!data?.company) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Nenhuma análise estruturada disponível para este lead.
      </div>
    );
  }

  if (!data.run) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Ainda não há um run de análise concluído. Inicie a análise na seção{" "}
        <strong className="font-semibold">Análise com IA</strong>.
      </div>
    );
  }

  const run = data.run;
  const findings = run.findings;
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: findings.filter((f) => f.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Braces className="h-5 w-5 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Findings e evidências
          </h2>
          {run.requiresHumanReview && (
            <span className="badge bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Revisão humana recomendada
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {run.provider}/{run.model} · prompt {run.promptVersion} ·{" "}
          {formatDuration(run.durationMs)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Status</dt>
          <dd className="mt-0.5 font-medium text-slate-800">{run.status}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Fatos</dt>
          <dd className="mt-0.5 font-medium text-slate-800">
            {findings.filter((f) => f.category === "FACT").length}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Inferências</dt>
          <dd className="mt-0.5 font-medium text-slate-800">
            {findings.filter((f) => f.category === "INFERENCE").length}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Elegíveis p/ mensagens</dt>
          <dd className="mt-0.5 font-semibold text-emerald-700">
            {findings.filter((f) => f.messageEligible).length}
          </dd>
        </div>
      </dl>

      {run.conflicts.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-800">
            <Scale className="h-4 w-4" />
            {run.conflicts.length} conflito(s) entre findings detectados
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-700">
            {run.conflicts.map((c) => (
              <li key={c.id}>
                “{c.from.claim}” vs “{c.to.claim}”
                {c.resolution ? ` — ${c.resolution}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {grouped.map(({ cat, items }) => (
          <div key={cat}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {CATEGORY_ICON(cat)}
              {FINDING_CATEGORY_LABELS[cat]}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {items.length}
              </span>
            </h3>
            <div className="space-y-2">
              {items.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
          </div>
        ))}

        {run.recommendations.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recomendações
            </h3>
            <ul className="space-y-2">
              {run.recommendations.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                >
                  <p className="flex items-center gap-2 font-medium text-slate-800">
                    <ClipboardCheck className="h-4 w-4 text-indigo-500" />
                    {r.title}
                    {r.priority && (
                      <span className="badge bg-slate-100 text-slate-600">
                        {r.priority}
                      </span>
                    )}
                  </p>
                  {r.description && (
                    <p className="mt-1 text-xs text-slate-600">{r.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: FindingView }) {
  const cat = finding.category as FindingCategory;
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-slate-800">{finding.claim}</p>
        <span className={`badge ring-1 ring-inset ${CATEGORY_BADGE[cat]}`}>
          {FINDING_CATEGORY_LABELS[cat]}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        {finding.value !== undefined && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
            {formatValue(finding.value)}
          </span>
        )}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
          {SOURCE_TYPE_LABELS[finding.sourceType] ?? finding.sourceType}
        </span>
        {typeof finding.confidence === "number" && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
            confiança {(finding.confidence * 100).toFixed(0)}%
          </span>
        )}
        {finding.messageEligible && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
            elegível p/ mensagem
          </span>
        )}
        {finding.requiresHumanReview && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
            revisão humana
          </span>
        )}
      </div>

      {finding.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {finding.evidence.map((ev) => (
            <EvidenceRow key={ev.id} ev={ev} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EvidenceRow({ ev }: { ev: EvidenceView }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
      {ev.url ? (
        <a
          href={ev.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"
        >
          <Link2 className="h-3 w-3" />
          {ev.url}
        </a>
      ) : (
        <span className="text-slate-400">sem url</span>
      )}
      {typeof ev.metricValue === "number" && (
        <span className="rounded bg-slate-100 px-1.5 py-0.5">
          {ev.metricName ?? "métrica"}: {ev.metricValue}
        </span>
      )}
      {ev.selector && (
        <span className="rounded bg-slate-100 px-1.5 py-0.5">{ev.selector}</span>
      )}
      <span className="rounded bg-slate-100 px-1.5 py-0.5">
        {SOURCE_TYPE_LABELS[ev.sourceType] ?? ev.sourceType}
      </span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5">{ev.evidenceType}</span>
      {ev.hash && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400">
          <ShieldCheck className="h-3 w-3" />
          {shortHash(ev.hash)}
        </span>
      )}
      {ev.extractedText && (
        <span className="w-full text-slate-500">
          “{truncate(ev.extractedText, 160)}”
        </span>
      )}
    </li>
  );
}

function CATEGORY_ICON(cat: FindingCategory) {
  const icons: Record<FindingCategory, React.ReactNode> = {
    FACT: <CircleDot className="h-3.5 w-3.5 text-emerald-500" />,
    INFERENCE: <Crosshair className="h-3.5 w-3.5 text-sky-500" />,
    UNKNOWN: <UserRound className="h-3.5 w-3.5 text-slate-400" />,
    RISK: <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />,
  };
  return icons[cat];
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
