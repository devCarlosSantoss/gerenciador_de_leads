"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Radar,
  Search,
  Star,
  Phone,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Save,
  Building2,
  Trash2,
  Info,
  Globe,
} from "lucide-react";
import type { ScrapedLead } from "@/lib/scraper/types";

export function CaptureForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<{
    saved: number;
    duplicates: number;
  } | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSavedMsg(null);
    setLeads([]);
    setSelected(new Set());
    setLoading(true);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location, maxResults: Number(maxResults) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao buscar leads");
      setLeads(data.leads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar leads");
    } finally {
      setLoading(false);
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const allSelected = leads.length > 0 && selected.size === leads.length;

  async function onSave() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const chosen = leads.filter((_, i) => selected.has(i));
      const res = await fetch("/api/leads/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar");
      setSavedMsg({ saved: data.saved, duplicates: data.duplicates });
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <Info className="h-4 w-4 shrink-0" />
          <p>
            A captura usa um navegador automatizado para fins pessoais. O Google
            pode bloquear buscas em excesso — faça pausas entre capturas grandes.
          </p>
        </div>

        <form onSubmit={onSearch} className="grid gap-4 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className="label">O que buscar?</label>
            <input
              className="input"
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex.: encanador, restaurante, clínica dental..."
            />
          </div>
          <div className="md:col-span-4">
            <label className="label">Cidade / região</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex.: São Paulo, Campinas..."
            />
          </div>
          <div className="md:col-span-3">
            <label className="label">Quantidade</label>
            <select
              className="input"
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
            >
              <option value="10">10 resultados</option>
              <option value="20">20 resultados</option>
              <option value="30">30 resultados</option>
              <option value="50">50 resultados</option>
            </select>
          </div>
          <div className="md:col-span-12 flex items-center justify-end gap-3">
            <p className="mr-auto text-xs text-slate-400">
              Origem: <span className="font-medium">Google Maps</span>
            </p>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Radar className="h-4 w-4" />
              )}
              {loading ? "Buscando..." : "Buscar leads"}
            </button>
          </div>
        </form>

        {loading && (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            Capturando os resultados do Google Maps... Isso pode levar alguns
            instantes.
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {savedMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {savedMsg.saved > 0
              ? `${savedMsg.saved} lead(s) salvos com sucesso!`
              : "Nenhum lead novo para salvar."}
            {savedMsg.duplicates > 0 &&
              ` ${savedMsg.duplicates} já existiam na base e foram ignorados.`}
          </div>
        )}
      </div>

      {leads.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-slate-700">
                {leads.length} resultados encontrados
              </p>
              <button
                className="btn-ghost h-8 px-2 text-xs"
                onClick={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(leads.map((_, i) => i))
                  )
                }
              >
                {allSelected ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost h-8 px-2 text-xs"
                onClick={() => {
                  setLeads([]);
                  setSelected(new Set());
                }}
              >
                <Trash2 className="h-4 w-4" />
                Limpar
              </button>
              <button
                className="btn-primary h-8 px-3 text-xs"
                disabled={selected.size === 0 || saving}
                onClick={onSave}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar {selected.size > 0 ? `${selected.size} ` : ""}
                selecionado{selected.size === 1 ? "" : "s"}
              </button>
            </div>
          </div>

          <ul className="divide-y divide-slate-100">
            {leads.map((lead, i) => (
              <li
                key={i}
                className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${
                  selected.has(i) ? "bg-indigo-50/50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{lead.name}</p>
                    {lead.rating != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {lead.rating.toFixed(1)}
                        {lead.reviews ? ` (${lead.reviews})` : ""}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    {lead.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {lead.phone}
                      </span>
                    )}
                    {lead.address && (
                      <span className="inline-flex max-w-[320px] items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{lead.address}</span>
                      </span>
                    )}
                    {lead.city && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        {lead.city}
                        {lead.state ? `/${lead.state}` : ""}
                      </span>
                    )}
                    {lead.category && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {lead.category}
                      </span>
                    )}
                    {lead.website && (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex max-w-[240px] items-center gap-1 truncate text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{lead.website}</span>
                      </a>
                    )}
                  </div>
                </div>
                {lead.sourceUrl && (
                  <a
                    href={lead.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost h-8 px-2 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Ver no Maps
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && leads.length === 0 && !error && (
        <div className="card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-600">
            <Search className="h-8 w-8" />
          </div>
          <div>
            <p className="font-medium text-slate-900">
              Ainda não buscou nada
            </p>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Informe o tipo de negócio e a cidade acima. O sistema abre o
              Google Maps, percorre os resultados e traz nome, telefone,
              endereço e avaliação para você revisar antes de salvar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
