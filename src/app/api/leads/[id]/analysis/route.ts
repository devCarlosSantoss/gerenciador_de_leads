import { getAnalysis, ProspectingApiError, resolveByExternalId } from "@/lib/prospecting";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const company = await resolveByExternalId(id);
    const data = await getAnalysis(company.id);
    return Response.json(data);
  } catch (err) {
    if (err instanceof ProspectingApiError && err.status === 404) {
      return Response.json({ migrated: false, company: null, analysis: null });
    }
    console.error("[api/leads/analysis]", err);
    return Response.json(
      { error: "Erro ao consultar a análise" },
      { status: 500 },
    );
  }
}