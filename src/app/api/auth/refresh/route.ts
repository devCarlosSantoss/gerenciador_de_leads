import { refreshSession } from "@/lib/session";

export async function POST() {
  const token = await refreshSession();
  if (!token) {
    return Response.json({ error: "Sessão expirada" }, { status: 401 });
  }
  return Response.json({ ok: true });
}