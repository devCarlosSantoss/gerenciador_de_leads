import { prisma } from "@/lib/db";
import { STATUS_KEYS, STATUS } from "@/lib/constants";
import { LeadsTable } from "@/components/leads-table";
import { LeadFilters } from "@/components/lead-filters";
import Link from "next/link";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

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

  const where = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { company: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
            { city: { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(status ? { status: status as (typeof STATUS_KEYS)[number] } : {}),
  };

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

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
