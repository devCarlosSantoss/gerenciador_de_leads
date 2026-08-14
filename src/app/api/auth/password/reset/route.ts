const AUTH_API_URL = (process.env.PROSPECTING_API_URL ?? "").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
      newPassword?: unknown;
    } | null;
    const token = String(body?.token ?? "");
    const newPassword = String(body?.newPassword ?? "");
    if (!token || !newPassword) {
      return Response.json(
        { error: "Token e nova senha são obrigatórios." },
        { status: 400 },
      );
    }
    if (!AUTH_API_URL) {
      return Response.json({ error: "Backend não configurado." }, { status: 500 });
    }

    const res = await fetch(`${AUTH_API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
      cache: "no-store",
    });

    if (res.ok) {
      return Response.json({ ok: true });
    }
    // A mensagem do backend é segura (não revela se o e-mail existe).
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return Response.json(
      { error: data?.message ?? "Não foi possível redefinir a senha." },
      { status: res.status },
    );
  } catch (err) {
    console.error("[api/auth/reset-password]", err);
    return Response.json({ error: "Não foi possível redefinir a senha." }, { status: 500 });
  }
}