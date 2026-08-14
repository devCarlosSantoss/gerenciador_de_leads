import { getSessionUser, type SessionUser } from "@/lib/session";

export {
  SESSION_COOKIE,
  REFRESH_COOKIE,
  verifyToken,
  getSessionUser,
  ensureAccessToken,
  type SessionUser,
} from "@/lib/session";

export type AuthUser = SessionUser;
export { getSessionUser as getAuthUser };