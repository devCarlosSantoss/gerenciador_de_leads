import { markContacted } from "@/lib/prospecting";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      companyId?: unknown;
      externalId?: unknown;
    };
    if (typeof body.companyId !== "string" || !body.companyId) {
      return Response.json({ error: "companyId é obrigatório" }, { status: 400 });
    }

    let backendStatus = "";
    try {
      const result = await markContacted(body.companyId);
      backendStatus = result.status;
    } catch (err) {
      console.error("[api/prospecting/contacted] backend", err);
    }

    return Response.json({ ok: true, status: backendStatus || "CONTATADO" });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Erro ao marcar lead como contatado" }, { status: 500 });
  }
}