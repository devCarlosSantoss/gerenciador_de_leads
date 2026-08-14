"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

export interface PendingItem {
  lead: {
    id: string;
    name: string;
    category: string | null;
    city: string | null;
    state: string | null;
  };
  messages: {
    id: string;
    content: string;
    variant: string;
  }[];
}

export function ManualReviewList({ items }: { items: PendingItem[] }) {
  const router = useRouter();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(companyId: string, messageId: string) {
    setApprovingId(messageId);
    setError(null);
    try {
      const res = await fetch("/api/prospecting/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, messageId }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Erro ao aprovar mensagem.");
        return;
      }
      router.refresh();
    } catch {
      setError("Erro de conexão ao aprovar mensagem.");
    } finally {
      setApprovingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card px-5 py-8 text-center">
        <p className="text-sm text-slate-500">
          Nenhuma mensagem aguardando aprovação.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {items.map((item) => (
        <div key={item.lead.id} className="card p-5">
          <div>
            <h3 className="font-semibold text-slate-900">{item.lead.name}</h3>
            <p className="text-xs text-slate-500">
              {[item.lead.category, item.lead.city, item.lead.state]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {item.messages.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-amber-200 bg-amber-50/40 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="badge bg-amber-50 text-amber-700 ring-amber-600/20">
                    {m.variant} · rascunho
                  </span>
                  <button
                    className="btn-primary h-8 px-3 text-xs"
                    onClick={() => approve(item.lead.id, m.id)}
                    disabled={approvingId === m.id}
                  >
                    {approvingId === m.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Aprovar e liberar
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {m.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
