import { Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { config } from "../config/env";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  type: "access";
}

@Injectable()
export class PersonalJwtService {
  private get secretKey(): Uint8Array {
    return new TextEncoder().encode(config.JWT_SECRET);
  }

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + this.parseTtl(config.JWT_ACCESS_TTL);
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.secretKey);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        algorithms: ["HS256"],
      });
      if (payload.type !== "access" || typeof payload.sub !== "string") return null;
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : "",
        name: typeof payload.name === "string" ? payload.name : "",
        type: "access",
      };
    } catch {
      return null;
    }
  }

  private parseTtl(ttl: string): number {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) return 15 * 60;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        return 15 * 60;
    }
  }
}