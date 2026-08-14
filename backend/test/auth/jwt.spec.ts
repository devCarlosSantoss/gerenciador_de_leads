import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { JwtService } from "../../src/auth/jwt.service";

const jwt = new JwtService();
const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

function sign(payload: Record<string, unknown>, expiresAt: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);
}

describe("JwtService", () => {
  it("valida um token recém-assinado", async () => {
    const token = await jwt.signAccessToken({
      sub: "u1",
      email: "a@b.com",
      name: "Ana",
      role: "ADMIN",
      orgId: "default",
    });
    const payload = await jwt.verifyAccessToken(token);
    expect(payload?.sub).toBe("u1");
    expect(payload?.role).toBe("ADMIN");
    expect(payload?.type).toBe("access");
  });

  it("rejeita token expirado", async () => {
    const token = await sign(
      { sub: "u1", type: "access" },
      Math.floor(Date.now() / 1000) - 100,
    );
    expect(await jwt.verifyAccessToken(token)).toBeNull();
  });

  it("rejeita token com assinatura adulterada", async () => {
    const token = await jwt.signAccessToken({
      sub: "u1",
      email: "a@b.com",
      name: "Ana",
      role: "ADMIN",
      orgId: "default",
    });
    const tampered = token.slice(0, -4) + "AAAA";
    expect(await jwt.verifyAccessToken(tampered)).toBeNull();
  });

  it("rejeita token de outro tipo (ex.: refresh)", async () => {
    const token = await sign(
      { sub: "u1", type: "refresh" },
      Math.floor(Date.now() / 1000) + 3600,
    );
    expect(await jwt.verifyAccessToken(token)).toBeNull();
  });

  it("rejeita texto que não é JWT", async () => {
    expect(await jwt.verifyAccessToken("nao-e-um-token")).toBeNull();
  });
});