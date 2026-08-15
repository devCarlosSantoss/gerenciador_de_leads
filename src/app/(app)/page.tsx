import { STATUS } from "@/lib/constants";
import Link from "next/link";
import {
  Users,
  Phone,
  Star,
  ArrowRight,
  Plus,
  TrendingUp,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { Lead } from "@/types/prisma";

export const dynamic = "force-dynamic";

async function getAuthHeaders(): Promise<HeadersInit> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("leads_session")?.value;
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function fetchLeads(pageSize = 6): Promise<Lead[]> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  if (!API_URL) return [];
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/leads?pageSize=${pageSize}`, { headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}

async function fetchStats() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  if (!API_URL) return { total: 0, withContact: 0, withEmail: 0, avgRating: null, byStatus: [], categories: [] };

  const headers = await getAuthHeaders();
  const [totalRes, contactRes, emailRes, ratingRes, statusRes, catRes] = await Promise.all([
    fetch(`${API_URL}/leads?pageSize=1`, { headers, cache: "no-store" }),
    fetch(`${API_URL}/leads?hasPhone=true&pageSize=1`, { headers, cache: "no-store" }),
    fetch(`${API_URL}/leads?hasEmail=true&pageSize=1`, { headers, cache: "no-store" }),
    fetch(`${API_URL}/leads/stats/rating`, { headers, cache: "no-store" }),
    fetch(`${API_URL}/leads/stats/by-status`, { headers, cache: "no-store" }),
    fetch(`${API_URL}/leads/stats/by-category`, { headers, cache: "no-store" }),
  ]);

  const total = totalRes.ok ? (await totalRes.json()).total ?? 0 : 0;
  const withContact = contactRes.ok ? (await contactRes.json()).total ?? 0 : 0;
  const withEmail = emailRes.ok ? (await emailRes.json()).total ?? 0 : 0;
  const avgRating = ratingRes.ok ? (await ratingRes.json()).avg ?? null : null;
  const byStatus = statusRes.ok ? await statusRes.json() : [];
  const categories = catRes.ok ? await catRes.json() : [];

  return { total, withContact, withEmail, avgRating, byStatus, categories };
}

export default async function DashboardPage() {
  const [recent, stats] = await Promise.all([
    fetchLeads(6),
    fetchStats(),
  ]);

  const { total, withContact, withEmail, avgRating, byStatus, categories } = stats;

  const statusMap = Object.fromEntries(
    byStatus.map((s: { status: string; count: number }) => [s.status, s.count])
  );

  const cat = categories
    .filter((c: { category: string | null }) => c.category)
    .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
    .slice(0, 5);

  const statsCards = [
    {
      label: "Total de leads",
      value: total,
      icon: Users,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Com telefone",
      value: withContact,
      icon: Phone,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Com e-mail",
      value: withEmail,
      icon: TrendingUp,
      color: "bg-amber-50 text-amber-600",
    },
    {
      label: "Avaliação média",
      value: avgRating ? avgRating.toFixed(1) : "—",
      icon: Star,
      color: "bg-violet-50 text-violet-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Visão geral dos seus leads capturados
          </p>
        </div>
        <Link href="/leads/novo" className="btn-primary">
          <Plus className="h-4 w-4" />
          Novo lead
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsCards.map((s) => (
          <div key={s.label} className="card p-5">
            <div className={`mb-3 inline-flex rounded-xl p-2.5 ${s.color}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Leads recentes</h2>
            <Link
              href="/leads"
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Ver todos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">
                Nenhum lead ainda. Comece capturando na internet.
              </p>
              <Link href="/capturar" className="btn-primary mt-4">
                Capturar leads
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {lead.name}
                        {lead.company ? (
                          <span className="ml-2 text-sm text-slate-500">
                            {lead.company}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {lead.city || lead.address || lead.category || "—"}
                      </p>
                    </div>
                    <StatusBadge status={lead.status as keyof typeof STATUS} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">
              Leads por status
            </h2>
            <div className="space-y-3">
              {Object.entries(STATUS).map(([key, s]) => {
                const count = statusMap[key] ?? 0;
                const pct = total ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                      <span className="font-medium text-slate-900">
                        {count}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${s.dot}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {cat.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-4 font-semibold text-slate-900">
                Principais categorias
              </h2>
              <ul className="space-y-2">
                {cat.map((c: { category: string; count: number }) => (
                  <li
                    key={c.category}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-slate-600">
                      {c.category}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {c.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}