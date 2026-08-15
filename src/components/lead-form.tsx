"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { STATUS_KEYS, STATUS, LEAD_SOURCES } from "@/lib/constants";
import type { LeadDetail, LeadContact, ContactChannel } from "@/types/prisma";

type LeadInput = {
  name: string;
  category: string;
  rating: string;
  reviews: string;
  status: string;
  notes: string;
  tags: string;
  source: string;
  sourceUrl: string;
  address: string;
  city: string;
  state: string;
  contacts: { type: ContactChannel; value: string; isPrimary: boolean }[];
};

const EMPTY: LeadInput = {
  name: "",
  category: "",
  rating: "",
  reviews: "",
  status: "NEW",
  notes: "",
  tags: "",
  source: "manual",
  sourceUrl: "",
  address: "",
  city: "",
  state: "",
  contacts: [],
};

function toInput(lead?: LeadDetail): LeadInput {
  if (!lead) return EMPTY;

  const contacts: { type: ContactChannel; value: string; isPrimary: boolean }[] = [];

  const phone = lead.contacts.find((c) => c.type === "PHONE");
  const whatsapp = lead.contacts.find((c) => c.type === "WHATSAPP");
  const email = lead.contacts.find((c) => c.type === "EMAIL");

  if (phone) contacts.push({ type: "PHONE", value: phone.value, isPrimary: phone.isPrimary });
  if (whatsapp) contacts.push({ type: "WHATSAPP", value: whatsapp.value, isPrimary: whatsapp.isPrimary });
  if (email) contacts.push({ type: "EMAIL", value: email.value, isPrimary: email.isPrimary });

  return {
    name: lead.name,
    category: lead.category ?? "",
    rating: lead.rating != null ? String(lead.rating) : "",
    reviews: lead.reviewsCount != null ? String(lead.reviewsCount) : "",
    status: lead.status,
    notes: lead.notes ?? "",
    tags: "",
    source: lead.dataOrigin ?? "manual",
    sourceUrl: lead.sourceUrl ?? "",
    address: lead.address ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    contacts,
  };
}

export function LeadForm({ lead }: { lead?: LeadDetail }) {
  const router = useRouter();
  const isEdit = Boolean(lead);
  const [form, setForm] = useState<LeadInput>(() => toInput(lead));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key: keyof LeadInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setContact = (type: ContactChannel) => (value: string) => {
    setForm((f) => {
      const existing = f.contacts.findIndex((c) => c.type === type);
      const contacts = [...f.contacts];
      if (value) {
        if (existing >= 0) {
          contacts[existing] = { type, value, isPrimary: contacts[existing]?.isPrimary ?? false };
        } else {
          contacts.push({ type, value, isPrimary: contacts.length === 0 });
        }
      } else if (existing >= 0) {
        contacts.splice(existing, 1);
      }
      return { ...f, contacts };
    });
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = {
        name: form.name,
        category: form.category || null,
        rating: form.rating ? parseFloat(form.rating) : null,
        reviews: form.reviews ? parseInt(form.reviews) : null,
        status: form.status,
        notes: form.notes || null,
        source: form.source || null,
        sourceUrl: form.sourceUrl || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        contacts: form.contacts,
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
              value={form.contacts.find((c) => c.type === "PHONE")?.value ?? ""}
              onChange={(e) => setContact("PHONE")(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input
              className="input"
              value={form.contacts.find((c) => c.type === "WHATSAPP")?.value ?? ""}
              onChange={(e) => setContact("WHATSAPP")(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input
              className="input"
              type="email"
              value={form.contacts.find((c) => c.type === "EMAIL")?.value ?? ""}
              onChange={(e) => setContact("EMAIL")(e.target.value)}
              placeholder="contato@empresa.com"
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
        <h2 className="mb-4 font-semibold text-slate-900">Avaliação e origem</h2>
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