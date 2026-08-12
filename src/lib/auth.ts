import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken } from "@/lib/session";

export { SESSION_COOKIE, createSession, getAdminCredentials, verifyToken } from "@/lib/session";

export async function getSessionUser(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}