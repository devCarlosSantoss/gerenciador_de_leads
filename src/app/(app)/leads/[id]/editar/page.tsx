import { notFound } from "next/navigation";
import { LeadForm } from "@/components/lead-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LeadDetail } from "@/types/prisma";

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

async function fetchLead(id: string): Promise<LeadDetail | null> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  if (!API_URL) return null;
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/leads/${id}`, { headers, cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await fetchLead(id);
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Editar lead</h1>
          <p className="text-sm text-slate-500">{lead.name}</p>
        </div>
        <Link href={`/leads/${lead.id}`} className="btn-ghost">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </div>
      <LeadForm lead={lead} />
    </div>
  );
}