import { clearAuthCookies, getRefreshToken } from "@/lib/session";

const AUTH_API_URL = (process.env.PROSPECTING_API_URL ?? "").replace(/\/$/, "");

export async function POST() {
  // Revoga o refresh token no backend antes de limpar os cookies.
  const refreshToken = await getRefreshToken();
  if (refreshToken && AUTH_API_URL) {
    try {
      await fetch(`${AUTH_API_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
    } catch {
      // A limpeza local acontece mesmo se o backend estiver indisponível.
    }
  }
  await clearAuthCookies();
  return Response.json({ ok: true });
}