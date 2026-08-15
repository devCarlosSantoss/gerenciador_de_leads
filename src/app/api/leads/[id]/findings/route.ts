import { getFindings, ProspectingApiError } from "@/lib/prospecting";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = await getFindings(id);
    return Response.json(data);
  } catch (err) {
    if (err instanceof ProspectingApiError && err.status === 404) {
      return Response.json({ migrated: false, run: null });
    }
    console.error("[api/leads/findings]", err);
    return Response.json(
      { error: "Erro ao consultar os findings da análise" },
      { status: 500 },
    );
  }
}