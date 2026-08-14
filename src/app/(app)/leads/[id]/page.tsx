import { prisma } from "@/lib/db";
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

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
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
