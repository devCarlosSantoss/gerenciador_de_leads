import { setAuthCookies } from "@/lib/session";

const AUTH_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

const GENERIC_ERROR = "Credenciais inválidas ou conta bloqueada.";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
    } | null;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return Response.json({ error: GENERIC_ERROR }, { status: 400 });
    }
    if (!AUTH_API_URL) {
      return Response.json(
        { error: "Backend de autenticação não configurado (NEXT_PUBLIC_API_URL)." },
        { status: 500 },
      );
    }

    const res = await fetch(`${AUTH_API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    if (!res.ok) {
      // Mensagem genérica: nunca revela se o e-mail existe ou se a conta está bloqueada.
      return Response.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const data = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
      user?: unknown;
    };
    if (!data.accessToken || !data.refreshToken) {
      return Response.json({ error: "Erro ao entrar. Tente novamente." }, { status: 500 });
    }

    await setAuthCookies(data.accessToken, data.refreshToken);
    return Response.json({ ok: true, user: data.user ?? null });
  } catch (err) {
    console.error("[api/auth/login]", err);
    return Response.json({ error: "Erro ao entrar. Tente novamente." }, { status: 500 });
  }
}