"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Star,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { Lead } from "@prisma/client";

export function LeadsTable({
  leads,
  page,
  totalPages,
  total,
  q,
  status,
}: {
  leads: Lead[];
  page: number;
  totalPages: number;
  total: number;
  q: string;
  status?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  async function deleteLeads(ids: string[]) {
    if (!confirm(`Excluir ${ids.length} lead(s)? Essa ação não pode ser desfeita.`))
      return;
    await fetch("/api/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setSelected([]);
    startTransition(() => router.refresh());
  }

  const allSelected = leads.length > 0 && selected.length === leads.length;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <p className="text-sm text-slate-600">
          {selected.length > 0
            ? `${selected.length} selecionado(s)`
            : `${total} resultado(s)`}
        </p>
        {selected.length > 0 && (
          <button
            className="btn-danger h-8 px-3 text-xs"
            onClick={() => deleteLeads(selected)}
          >
            <Trash2 className="h-4 w-4" />
            Excluir selecionados
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelected(e.target.checked ? leads.map((l) => l.id) : [])
                  }
                />
              </th>
              <th className="px-4 py-3">Lead</th>
              <th className="hidden px-4 py-3 md:table-cell">Contato</th>
              <th className="hidden px-4 py-3 lg:table-cell">Local</th>
              <th className="hidden px-4 py-3 xl:table-cell">Avaliação</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className={`hover:bg-slate-50 ${
                  selected.includes(lead.id) ? "bg-indigo-50/50" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={selected.includes(lead.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, lead.id]
                          : prev.filter((id) => id !== lead.id)
                      )
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="block max-w-[240px]"
                  >
                    <span className="block truncate font-medium text-slate-900 hover:text-indigo-600">
                      {lead.name}
                    </span>
                    {lead.company && (
                      <span className="block truncate text-xs text-slate-500">
                        {lead.company}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <div className="space-y-0.5 text-slate-600">
                    {lead.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {lead.phone}
                      </span>
                    )}
                    {lead.email && (
                      <span className="flex max-w-[200px] items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{lead.email}</span>
                      </span>
                    )}
                    {!lead.phone && !lead.email && (
                      <span className="text-slate-400">Sem contato</span>
                    )}
                  </div>
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <div className="max-w-[200px] text-slate-600">
                    {lead.city && <span className="block truncate">{lead.city}</span>}
                    {lead.category && (
                      <span className="block truncate text-xs text-slate-400">
                        {lead.category}
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden px-4 py-3 xl:table-cell">
                  {lead.rating ? (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {lead.rating.toFixed(1)}
                      {lead.reviews ? (
                        <span className="text-xs text-slate-400">
                          ({lead.reviews})
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                      title="Abrir"
                    >
                      <MapPin className="hidden" />
                      <span className="sr-only">Abrir</span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    <button
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                      title="Excluir"
                      onClick={() => deleteLeads([lead.id])}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">
              Nenhum lead encontrado {q ? `para "${q}"` : ""}.
            </p>
            {q || status ? (
              <Link href="/leads" className="btn-secondary mt-4">
                Limpar filtros
              </Link>
            ) : (
              <Link href="/capturar" className="btn-primary mt-4">
                Capturar leads da internet
              </Link>
            )}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/leads?page=${page - 1}${q ? `&q=${q}` : ""}${
                  status ? `&status=${status}` : ""
                }`}
                className="btn-secondary h-8 px-3 text-xs"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/leads?page=${page + 1}${q ? `&q=${q}` : ""}${
                  status ? `&status=${status}` : ""
                }`}
                className="btn-secondary h-8 px-3 text-xs"
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
      {isPending && (
        <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-400">
          Atualizando...
        </div>
      )}
    </div>
  );
}
