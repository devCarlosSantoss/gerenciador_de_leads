import "server-only";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

export const SESSION_COOKIE = "leads_session";
export const REFRESH_COOKIE = "leads_refresh";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "";
  if (!secret) {
    throw new Error(
      "JWT_SECRET ausente. Gere um com `openssl rand -hex 32` e defina no .env (mesmo valor do backend).",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Valida um access token JWT emitido pelo backend (sem tocar em cookies). */
export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (payload.type !== "access" || typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "",
      mustChangePassword: typeof payload.mustChangePassword === "boolean" ? payload.mustChangePassword : false,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// ─────────────────────── Cookies (server-only) ───────────────────────

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return verifyToken(token);
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, accessToken, sessionCookieOptions(ACCESS_TOKEN_TTL_SECONDS));
  store.set(REFRESH_COOKIE, refreshToken, sessionCookieOptions(REFRESH_TOKEN_TTL_SECONDS));
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(REFRESH_COOKIE);
}

// ─────────────────── Refresh silencioso (server-only) ───────────────────

function authApiBaseUrl(): string {
  return (process.env.PROSPECTING_API_URL ?? "").replace(/\/$/, "");
}

/** Troca o refresh token por um novo par (rotação) e atualiza os cookies. */
export async function refreshSession(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  const baseUrl = authApiBaseUrl();
  if (!refreshToken || !baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (!data.accessToken || !data.refreshToken) return null;
    await setAuthCookies(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Garante um access token válido para chamadas server-side ao backend.
 * Se o atual for válido, devolve-o; caso contrário, tenta renovar com o
 * refresh token. Retorna null quando não há sessão.
 */
export async function ensureAccessToken(): Promise<string | null> {
  const token = await getAccessToken();
  if (token && (await verifyToken(token))) return token;
  return refreshSession();
}