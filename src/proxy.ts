import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  REFRESH_COOKIE,
  verifyToken,
  sessionCookieOptions,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/session";

const AUTH_API_URL = (process.env.PROSPECTING_API_URL ?? "").replace(/\/$/, "");

// Páginas públicas do grupo (auth) — redirecionam para / quando logado.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function buildCookieHeader(accessToken: string, refreshToken: string): string {
  return `${SESSION_COOKIE}=${accessToken}; ${REFRESH_COOKIE}=${refreshToken}`;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  let user = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value ?? "");

  // Refresh silencioso quando o access token expirou (mas há refresh token).
  if (!user) {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? "";
    if (refreshToken && AUTH_API_URL) {
      try {
        const res = await fetch(`${AUTH_API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            accessToken?: string;
            refreshToken?: string;
          };
          if (data.accessToken && data.refreshToken) {
            user = await verifyToken(data.accessToken);
            if (user) {
              // Propaga o novo access token para route handlers a jusante
              // e devolve os cookies atualizados ao navegador.
              const requestHeaders = new Headers(request.headers);
              requestHeaders.set(
                "cookie",
                buildCookieHeader(data.accessToken, data.refreshToken),
              );
              const response = NextResponse.next({
                request: { headers: requestHeaders },
              });
              response.cookies.set(
                SESSION_COOKIE,
                data.accessToken,
                sessionCookieOptions(ACCESS_TOKEN_TTL_SECONDS),
              );
              response.cookies.set(
                REFRESH_COOKIE,
                data.refreshToken,
                sessionCookieOptions(REFRESH_TOKEN_TTL_SECONDS),
              );
              return response;
            }
          }
        }
      } catch {
        // Backend indisponível: cai no fluxo de "não autenticado".
      }
    }
  }

  if (!user) {
    if (isApi) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (isPublicPage(pathname)) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isPublicPage(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next({ request: { headers: request.headers } });
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};