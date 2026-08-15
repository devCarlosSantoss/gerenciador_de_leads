"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { STATUS_KEYS, STATUS, LEAD_SOURCES } from "@/lib/constants";
import type { Lead } from "@/types/prisma";

type LeadInput = {
  name: string;
  company: string;
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  address: string;
  city: string;
  state: string;
  category: string;
  rating: string;
  reviews: string;
  status: string;
  notes: string;
  tags: string;
  source: string;
  sourceUrl: string;
};

const EMPTY: LeadInput = {
  name: "",
  company: "",
  email: "",
  phone: "",
  whatsapp: "",
  website: "",
  address: "",
  city: "",
  state: "",
  category: "",
  rating: "",
  reviews: "",
  status: "NOVO",
  notes: "",
  tags: "",
  source: "manual",
  sourceUrl: "",
};

function toInput(lead?: Lead): LeadInput {
  if (!lead) return EMPTY;
  return {
    name: lead.name,
    company: lead.company ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    whatsapp: lead.whatsapp ?? "",
    website: lead.website ?? "",
    address: lead.address ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    category: lead.category ?? "",
    rating: lead.rating != null ? String(lead.rating) : "",
    reviews: lead.reviews != null ? String(lead.reviews) : "",
    status: lead.status,
    notes: lead.notes ?? "",
    tags: (lead.tags ?? []).join(", "),
    source: lead.source ?? "manual",
    sourceUrl: lead.sourceUrl ?? "",
  };
}

export function LeadForm({ lead }: { lead?: Lead }) {
  const router = useRouter();
  const isEdit = Boolean(lead);
  const [form, setForm] = useState<LeadInput>(() => toInput(lead));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key: keyof LeadInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = {
        name: form.name,
        company: form.company || null,
        email: form.email || null,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        website: form.website || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        category: form.category || null,
        rating: form.rating ? parseFloat(form.rating) : null,
        reviews: form.reviews ? parseInt(form.reviews) : null,
        status: form.status,
        notes: form.notes || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        source: form.source || null,
        sourceUrl: form.sourceUrl || null,
      };

      const res = await fetch(isEdit ? `/api/leads/${lead!.id}` : "/api/leads", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Erro ao salvar lead");
      }
      const saved = await res.json();
      router.push(`/leads/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Informações principais</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              Nome / Razão social <span className="text-rose-500">*</span>
            </label>
            <input
              className="input"
              required
              value={form.name}
              onChange={set("name")}
              placeholder="Ex.: João Silva"
            />
          </div>
          <div>
            <label className="label">Empresa</label>
            <input
              className="input"
              value={form.company}
              onChange={set("company")}
              placeholder="Ex.: Padaria Estrela"
            />
          </div>
          <div>
            <label className="label">Categoria</label>
            <input
              className="input"
              value={form.category}
              onChange={set("category")}
              placeholder="Ex.: Restaurante, Pet Shop..."
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={set("status")}>
              {STATUS_KEYS.map((k) => (
                <option key={k} value={k}>
                  {STATUS[k].label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Contato</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Telefone</label>
            <input
              className="input"
              value={form.phone}
              onChange={set("phone")}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input
              className="input"
              value={form.whatsapp}
              onChange={set("whatsapp")}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="contato@empresa.com"
            />
          </div>
          <div>
            <label className="label">Website</label>
            <input
              className="input"
              type="url"
              value={form.website}
              onChange={set("website")}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Localização</h2>
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-4">
            <label className="label">Endereço</label>
            <input
              className="input"
              value={form.address}
              onChange={set("address")}
              placeholder="Rua, número, bairro"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="label">Cidade</label>
            <input className="input" value={form.city} onChange={set("city")} />
          </div>
          <div className="sm:col-span-1">
            <label className="label">UF</label>
            <input className="input" maxLength={2} value={form.state} onChange={set("state")} />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Avaliação e tags</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Avaliação (0–5)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={form.rating}
              onChange={set("rating")}
            />
          </div>
          <div>
            <label className="label">Nº de avaliações</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.reviews}
              onChange={set("reviews")}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Tags (separadas por vírgula)</label>
            <input
              className="input"
              value={form.tags}
              onChange={set("tags")}
              placeholder="hot lead, atendimento, urgente"
            />
          </div>
          <div>
            <label className="label">Origem</label>
            <select className="input" value={form.source} onChange={set("source")}>
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="label">Link de origem</label>
            <input
              className="input"
              type="url"
              value={form.sourceUrl}
              onChange={set("sourceUrl")}
              placeholder="https://www.google.com/maps/place/..."
            />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Notas</h2>
        <textarea
          className="input min-h-[120px]"
          value={form.notes}
          onChange={set("notes")}
          placeholder="Observações, histórico de contato, interesses..."
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar lead"}
        </button>
      </div>
    </form>
  );
}
