import { clearAuthCookies, ensureAccessToken } from "@/lib/session";

const AUTH_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const accessToken = await ensureAccessToken();
    if (!accessToken) {
      return Response.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    } | null;
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      return Response.json(
        { error: "Senha atual e nova senha são obrigatórias." },
        { status: 400 },
      );
    }
    if (!AUTH_API_URL) {
      return Response.json({ error: "Backend não configurado." }, { status: 500 });
    }

    const res = await fetch(`${AUTH_API_URL}/auth/password/change`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
      cache: "no-store",
    });

    if (res.ok) {
      // O backend revoga todos os refresh tokens: força novo login.
      await clearAuthCookies();
      return Response.json({ ok: true });
    }
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return Response.json(
      { error: data?.message ?? "Não foi possível alterar a senha." },
      { status: res.status },
    );
  } catch (err) {
    console.error("[api/auth/change-password]", err);
    return Response.json({ error: "Não foi possível alterar a senha." }, { status: 500 });
  }
}