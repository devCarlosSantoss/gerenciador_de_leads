import { notFound } from "next/navigation";
import { LeadDetail } from "@/components/lead-detail";
import {
  AnalysisPanel,
  type PanelData,
} from "@/components/analysis-panel";
import { FindingsPanel } from "@/components/findings-panel";
import {
  getAnalysis,
  ProspectingApiError,
  resolveByExternalId,
} from "@/lib/prospecting";
import type { LeadDetail as LeadDetailType } from "@/types/prisma";

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

async function fetchLead(id: string): Promise<LeadDetailType | null> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  if (!API_URL) return null;
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/leads/${id}`, { headers, cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await fetchLead(id);
  if (!lead) notFound();

  let initial: PanelData | null = null;
  let initialError = "";
  try {
    const company = await resolveByExternalId(id);
    const data = await getAnalysis(company.id);
    initial = {
      migrated: true,
      company: data.company,
      analysis: data.analysis,
    };
  } catch (err) {
    if (err instanceof ProspectingApiError && err.status === 404) {
      initial = { migrated: false, company: null, analysis: null };
    } else {
      initialError = "Não foi possível consultar a análise no backend.";
    }
  }

  return (
    <div className="space-y-6">
      <LeadDetail lead={lead} />
      <AnalysisPanel leadId={lead.id} initial={initial} initialError={initialError} />
      <FindingsPanel leadId={lead.id} />
    </div>
  );
}