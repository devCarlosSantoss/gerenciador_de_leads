import { Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config/env";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  orgId: string;
  type: "access";
}

const ACCESS_TTL_SECONDS = toSeconds(config.JWT_ACCESS_TTL);

function toSeconds(ttl: string): number {
  const m = /^(\d+)(s|m|h|d)$/.exec(ttl.trim());
  if (!m) return 15 * 60;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    default:
      return 15 * 60;
  }
}

@Injectable()
export class JwtService {
  private readonly secret = new TextEncoder().encode(config.JWT_SECRET);

  signAccessToken(payload: Omit<AccessTokenPayload, "type">): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS;
    return new SignJWT({ ...payload, type: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ["HS256"],
      });
      if (payload.type !== "access" || typeof payload.sub !== "string") {
        return null;
      }
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : "",
        name: typeof payload.name === "string" ? payload.name : "",
        role: typeof payload.role === "string" ? payload.role : "",
        orgId: typeof payload.orgId === "string" ? payload.orgId : "",
        type: "access",
      };
    } catch {
      return null;
    }
  }
}