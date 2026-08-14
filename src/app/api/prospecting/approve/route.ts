import { approveMessage, ProspectingApiError } from "@/lib/prospecting";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      companyId?: unknown;
      messageId?: unknown;
    };
    if (
      typeof body.companyId !== "string" ||
      !body.companyId ||
      typeof body.messageId !== "string" ||
      !body.messageId
    ) {
      return Response.json({ error: "companyId e messageId são obrigatórios" }, { status: 400 });
    }
    const result = await approveMessage(body.companyId, body.messageId);
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ProspectingApiError ? err.status : 500;
    return Response.json({ error: (err as Error).message }, { status });
  }
}
