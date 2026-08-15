import { STATUS_KEYS, STATUS } from "@/lib/constants";
import { LeadsTable } from "@/components/leads-table";
import { LeadFilters } from "@/components/lead-filters";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { LeadListItem } from "@/types/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

async function getAuthHeaders(): Promise<HeadersInit> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("leads_session")?.value;
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function fetchLeads(params: {
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
}): Promise<{ data: LeadListItem[]; total: number }> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  if (!API_URL) return { data: [], total: 0 };

  const headers = await getAuthHeaders();
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  search.set("page", String(params.page));
  search.set("pageSize", String(params.pageSize));

  const res = await fetch(`${API_URL}/leads?${search}`, { headers, cache: "no-store" });
  if (!res.ok) return { data: [], total: 0 };

  return res.json();
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status =
    typeof sp.status === "string" &&
    (STATUS_KEYS as string[]).includes(sp.status)
      ? sp.status
      : undefined;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1") || 1);

  const { data: leads, total } = await fetchLeads({
    q,
    status,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">
            {total} lead{total === 1 ? "" : "s"} cadastrado{total === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/leads/novo" className="btn-primary">
          <Plus className="h-4 w-4" />
          Novo lead
        </Link>
      </div>

      <LeadFilters initialQ={q} initialStatus={status} statusOptions={STATUS} />

      <LeadsTable
        leads={leads}
        page={page}
        totalPages={totalPages}
        total={total}
        q={q}
        status={status}
      />
    </div>
  );
}