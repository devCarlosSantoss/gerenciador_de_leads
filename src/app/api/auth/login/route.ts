import { cookies } from "next/headers";
import {
  createSession,
  getAdminCredentials,
  SESSION_COOKIE,
  safeEqual,
} from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      username?: unknown;
      password?: unknown;
    } | null;
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");
    const creds = getAdminCredentials();

    if (
      !username ||
      !password ||
      !safeEqual(username, creds.username) ||
      !safeEqual(password, creds.password)
    ) {
      return Response.json(
        { error: "Usuário ou senha inválidos" },
        { status: 401 }
      );
    }

    const store = await cookies();
    store.set(SESSION_COOKIE, createSession(username), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/login]", err);
    return Response.json({ error: "Erro ao entrar" }, { status: 500 });
  }
}