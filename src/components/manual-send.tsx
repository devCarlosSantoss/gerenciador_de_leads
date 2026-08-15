"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Ban,
  Check,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  MessageCircle,
  Reply,
  Send,
} from "lucide-react";
import type { ChatLink } from "@/lib/prospecting";
import { LEAD_STATUS_LABELS } from "@shared/contact-lifecycle";

export interface ManualSendItem {
  lead: {
    id: string;
    externalId: string | null;
    name: string;
    category: string | null;
    city: string | null;
    state: string | null;
    contactStatus: string | null;
  };
  messages: {
    id: string;
    content: string;
    variant: string;
    link: ChatLink | null;
  }[];
}

async function lifecycle(body: Record<string, unknown>) {
  const res = await fetch("/api/prospecting/lifecycle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { error?: string; ok?: boolean };
  if (!res.ok) throw new Error(data.error ?? "Falha ao registrar ação");
  return data;
}

export function ManualSendList({ items }: { items: ManualSendItem[] }) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSendFor, setConfirmSendFor] = useState<{
    leadId: string;
    messageId: string;
  } | null>(null);
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [optOutFor, setOptOutFor] = useState<string | null>(null);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 6000);
  }

  async function copy(text: string, item: ManualSendItem, messageId: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 1800);
    try {
      await lifecycle({ action: "copy", companyId: item.lead.id, messageId });
      flash("Cópia registrada. O lead continua na lista até você confirmar o envio.");
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }

  async function openLink(url: string, item: ManualSendItem, messageId: string) {
    try {
      await lifecycle({ action: "chat-link-open", companyId: item.lead.id, messageId });
    } catch {
      // abrir o WhatsApp não pode ser bloqueado por falha de registro
    }
    window.open(url, "_blank", "noreferrer");
  }

  async function confirmSendNow(item: ManualSendItem, messageId: string) {
    setBusyId(item.lead.id);
    setErrorMsg(null);
    try {
      await lifecycle({
        action: "confirm-send",
        companyId: item.lead.id,
        messageId,
        externalId: item.lead.externalId,
      });
      setList((prev) => prev.filter((i) => i.lead.id !== item.lead.id));
      setConfirmSendFor(null);
      flash("Envio confirmado! O lead foi marcado como contatado e saiu da lista.");
      router.refresh();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function registerReplyNow(item: ManualSendItem) {
    if (!replyText.trim()) return;
    setBusyId(item.lead.id);
    setErrorMsg(null);
    try {
      await lifecycle({
        action: "reply",
        companyId: item.lead.id,
        content: replyText.trim(),
      });
      setList((prev) => prev.filter((i) => i.lead.id !== item.lead.id));
      setReplyOpenFor(null);
      setReplyText("");
      flash("Resposta registrada. O lead foi atualizado no funil.");
      router.refresh();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function optOutNow(item: ManualSendItem) {
    setBusyId(item.lead.id);
    setErrorMsg(null);
    try {
      await lifecycle({ action: "opt-out", companyId: item.lead.id });
      setList((prev) => prev.filter((i) => i.lead.id !== item.lead.id));
      setOptOutFor(null);
      flash("Opt-out registrado. O lead não receberá mais contatos.");
      router.refresh();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (list.length === 0) {
    return (
      <div className="card py-16 text-center">
        <MessageCircle className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">
          Nenhum lead pronto para envio manual.{" "}
          <br className="hidden sm:block" />
          Após aprovar uma mensagem, o lead aparece aqui. Abrir o WhatsApp ou
          copiar a mensagem <strong>não</strong> marca o contato: use o botão
          “Confirmar envio” depois de enviar de verdade.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{notice}</p>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Envio 100% manual: abrir o WhatsApp ou copiar a mensagem{" "}
          <strong>não</strong> marca o lead como contatado — só registra a ação.
          Depois de enviar de verdade, clique em <strong>“Confirmar envio”</strong>.
          Para evitar abrir uma janela nova, use o app WhatsApp Desktop (os links
          abrem dentro dele) ou copie a mensagem e cole na janela já aberta.
        </p>
      </div>

      {list.map((item) => (
        <div key={item.lead.id} className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                {item.lead.name}
                {item.lead.contactStatus &&
                  LEAD_STATUS_LABELS[item.lead.contactStatus as keyof typeof LEAD_STATUS_LABELS] && (
                    <span className="badge bg-sky-50 text-sky-700 ring-sky-600/20">
                      {LEAD_STATUS_LABELS[item.lead.contactStatus as keyof typeof LEAD_STATUS_LABELS]}
                    </span>
                  )}
              </h2>
              <p className="text-xs text-slate-500">
                {[item.lead.category, item.lead.city, item.lead.state]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {item.messages.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="badge bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                    {m.variant} · aprovada
                  </span>
                  {m.link && <span className="text-xs text-slate-400">{m.link.phone}</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{m.content}</p>
                {m.link && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary h-8 px-3 text-xs"
                      onClick={() => openLink(m.link!.url, item, m.id)}
                      disabled={busyId === item.lead.id}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir no WhatsApp
                    </button>
                    <button
                      type="button"
                      className="btn-secondary h-8 px-3 text-xs"
                      onClick={() => copy(m.content, item, m.id)}
                      disabled={busyId === item.lead.id}
                    >
                      {copiedId === m.id ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copiedId === m.id ? "Copiado!" : "Copiar mensagem"}
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      onClick={() =>
                        setConfirmSendFor({ leadId: item.lead.id, messageId: m.id })
                      }
                      disabled={busyId === item.lead.id}
                    >
                      <Send className="h-4 w-4" />
                      Confirmar envio
                    </button>
                    {busyId === item.lead.id && (
                      <Loader2 className="h-4 w-4 animate-spin self-center text-slate-400" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {confirmSendFor?.leadId === item.lead.id && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <p className="text-emerald-900">
                Confirma que a mensagem foi <strong>enviada de verdade</strong> no
                WhatsApp? O lead será marcado como contatado e sairá da lista.
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="btn-secondary h-8 px-3 text-xs"
                  onClick={() => setConfirmSendFor(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition hover:bg-emerald-700"
                  onClick={() =>
                    confirmSendNow(item, confirmSendFor.messageId)
                  }
                  disabled={busyId === item.lead.id}
                >
                  {busyId === item.lead.id ? "Confirmando..." : "Sim, já enviei"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-xs"
              onClick={() => {
                setReplyOpenFor(item.lead.id);
                setOptOutFor(null);
              }}
            >
              <Reply className="h-4 w-4" />
              Registrar resposta
            </button>
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-xs text-rose-700 hover:bg-rose-50"
              onClick={() => {
                setOptOutFor(item.lead.id);
                setReplyOpenFor(null);
              }}
            >
              <Ban className="h-4 w-4" />
              Opt-out
            </button>
          </div>

          {replyOpenFor === item.lead.id && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                placeholder="Ex.: respondeu pedindo um orçamento…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary h-8 px-3 text-xs"
                  onClick={() => {
                    setReplyOpenFor(null);
                    setReplyText("");
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary h-8 px-3 text-xs"
                  onClick={() => registerReplyNow(item)}
                  disabled={busyId === item.lead.id || !replyText.trim()}
                >
                  Registrar resposta
                </button>
              </div>
            </div>
          )}

          {optOutFor === item.lead.id && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
              <p className="text-rose-900">
                Registrar <strong>opt-out</strong>? O lead entra na lista de
                supressão e não receberá mais contatos.
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="btn-secondary h-8 px-3 text-xs"
                  onClick={() => setOptOutFor(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="h-8 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white transition hover:bg-rose-700"
                  onClick={() => optOutNow(item)}
                  disabled={busyId === item.lead.id}
                >
                  Confirmar opt-out
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}