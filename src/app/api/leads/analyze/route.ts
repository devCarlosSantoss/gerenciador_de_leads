import {
  enqueueAnalysis,
  ProspectingApiError,
} from "@/lib/prospecting";

interface AnalyzeResult {
  id: string;
  queued: boolean;
  message: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return Response.json({ error: "Nenhum lead selecionado" }, { status: 400 });
    }

    const results: AnalyzeResult[] = [];
    for (const id of body.ids) {
      if (typeof id !== "string" || !id.trim()) continue;
      try {
        await enqueueAnalysis(id);
        results.push({
          id,
          queued: true,
          message: `Em análise — veja o progresso na página do lead.`,
        });
      } catch (err) {
        if (err instanceof ProspectingApiError && err.status === 404) {
          results.push({
            id,
            queued: false,
            message: `Lead ainda não migrado para o novo sistema.`,
          });
        } else {
          results.push({
            id,
            queued: false,
            message: `Falha ao enfileirar análise: ${(err as Error).message}`,
          });
        }
      }
    }

    const failed = results.filter((r) => !r.queued).length;
    return Response.json({
      results,
      enqueued: results.length - failed,
      failed,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Erro ao analisar leads" }, { status: 500 });
  }
}