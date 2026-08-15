"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MessageCircle,
  Globe,
  MapPin,
  Star,
  Tag,
  StickyNote,
  Pencil,
  Trash2,
  Link2,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { Lead } from "@/types/prisma";

export function LeadDetail({ lead }: { lead: Lead }) {
  const router = useRouter();

  function fmtWhatsApp(n: string) {
    const digits = n.replace(/\D/g, "");
    return digits.startsWith("55") ? digits : `55${digits}`;
  }

  async function onDelete() {
    if (!confirm("Excluir este lead? Essa ação não pode ser desfeita.")) return;
    const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/leads");
      router.refresh();
    }
  }

  const contactActions = [
    lead.whatsapp && {
      label: "WhatsApp",
      href: `https://wa.me/${fmtWhatsApp(lead.whatsapp)}`,
      icon: MessageCircle,
      className: "bg-emerald-600 hover:bg-emerald-700",
    },
    lead.phone && {
      label: "Ligar",
      href: `tel:${lead.phone}`,
      icon: Phone,
      className: "bg-indigo-600 hover:bg-indigo-700",
    },
    lead.email && {
      label: "E-mail",
      href: `mailto:${lead.email}`,
      icon: Mail,
      className: "bg-slate-700 hover:bg-slate-800",
    },
    lead.website && {
      label: "Site",
      href: lead.website,
      icon: Globe,
      className: "bg-slate-600 hover:bg-slate-700",
    },
  ].filter(Boolean) as { label: string; href: string; icon: typeof Phone; className: string }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/leads" className="btn-ghost -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="flex gap-2">
          <Link href={`/leads/${lead.id}/editar`} className="btn-secondary">
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
          <button className="btn-danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </button>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{lead.name}</h1>
                {lead.company && (
                  <p className="flex items-center gap-1.5 text-slate-500">
                    <Building2 className="h-4 w-4" />
                    {lead.company}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={lead.status} />
              {lead.category && (
                <span className="badge bg-slate-100 text-slate-700">
                  {lead.category}
                </span>
              )}
              {lead.rating != null && (
                <span className="badge bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {lead.rating.toFixed(1)}
                  {lead.reviews ? ` (${lead.reviews})` : ""}
                </span>
              )}
              {lead.source && (
                <span className="badge bg-slate-100 text-slate-500">
                  {lead.source === "google_maps" ? "Google Maps" : lead.source}
                </span>
              )}
            </div>
          </div>
          {contactActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contactActions.map((a) => (
                <a
                  key={a.label}
                  href={a.href}
                  target={a.href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className={`btn text-white ${a.className}`}
                >
                  <a.icon className="h-4 w-4" />
                  {a.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-900">Detalhes</h2>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {[
              { label: "Telefone", value: lead.phone },
              { label: "WhatsApp", value: lead.whatsapp },
              { label: "E-mail", value: lead.email },
              { label: "Website", value: lead.website },
              { label: "Endereço", value: lead.address },
              { label: "Cidade", value: lead.city ? `${lead.city}${lead.state ? `/${lead.state}` : ""}` : lead.state },
              { label: "Categoria", value: lead.category },
              { label: "Criado em", value: lead.createdAt.toLocaleDateString("pt-BR") },
            ].map((row) => (
              <div key={row.label} className="border-b border-slate-100 pb-3">
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  {row.label}
                </dt>
                <dd className="mt-0.5 break-words text-sm text-slate-800">
                  {row.value || "—"}
                </dd>
              </div>
            ))}
          </dl>

          {lead.sourceUrl && (
            <a
              href={lead.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              <Link2 className="h-4 w-4" />
              Ver origem do lead
            </a>
          )}
        </div>

        <div className="space-y-6">
          {lead.tags.length > 0 && (
            <div className="card p-6">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <Tag className="h-4 w-4 text-slate-400" />
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {lead.tags.map((t) => (
                  <span key={t} className="badge bg-indigo-50 text-indigo-700">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {lead.notes && (
            <div className="card p-6">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <StickyNote className="h-4 w-4 text-slate-400" />
                Notas
              </h3>
              <p className="whitespace-pre-wrap text-sm text-slate-600">
                {lead.notes}
              </p>
            </div>
          )}
          {lead.address && (
            <div className="card p-6">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <MapPin className="h-4 w-4 text-slate-400" />
                Localização
              </h3>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [lead.address, lead.city, lead.state].filter(Boolean).join(", ")
                )}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Abrir no Google Maps →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
