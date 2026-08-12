import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "leads_session";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USER || "admin",
    password: process.env.ADMIN_PASSWORD || "admin123",
  };
}

function getSecret(): string {
  return process.env.AUTH_SECRET || "leads-pro-dev-secret-change-me";
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSession(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: username, exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof data.sub !== "string") return null;
    if (typeof data.exp === "number" && data.exp < Date.now()) return null;
    return data.sub;
  } catch {
    return null;
  }
}