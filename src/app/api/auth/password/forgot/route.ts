const AUTH_API_URL = (process.env.PROSPECTING_API_URL ?? "").replace(/\/$/, "");

const GENERIC_MESSAGE =
  "Se o e-mail estiver cadastrado, você receberá um link de redefinição.";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
    } | null;
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email) {
      return Response.json({ message: "Informe seu e-mail." }, { status: 400 });
    }
    if (!AUTH_API_URL) {
      return Response.json({ message: GENERIC_MESSAGE }, { status: 200 });
    }

    const res = await fetch(`${AUTH_API_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    // Em desenvolvimento o backend devolve `resetToken` para permitir testar
    // o fluxo sem infraestrutura de e-mail. Em produção só a mensagem genérica.
    if (res.ok && data) {
      return Response.json(data, { status: 200 });
    }
    return Response.json({ message: GENERIC_MESSAGE }, { status: 200 });
  } catch (err) {
    console.error("[api/auth/forgot-password]", err);
    return Response.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }
}