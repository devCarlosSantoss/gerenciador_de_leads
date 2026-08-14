import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { verifyToken, signAccessToken } from "@/lib/session";

const TEST_SECRET = "test-secret-test-secret-test-secret-test-secret";

const CLAIMS = {
  sub: "u_1",
  email: "ana@empresa.com",
  name: "Ana Souza",
  role: "ADMIN",
  orgId: "default",
};

beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

describe("session (JWT)", () => {
  it("assina e valida um access token com as claims esperadas", async () => {
    const token = await signAccessToken(CLAIMS);
    const user = await verifyToken(token);

    expect(user).not.toBeNull();
    expect(user?.sub).toBe("u_1");
    expect(user?.email).toBe("ana@empresa.com");
    expect(user?.name).toBe("Ana Souza");
    expect(user?.role).toBe("ADMIN");
    expect(user?.orgId).toBe("default");
  });

  it("rejeita token assinado com segredo diferente", async () => {
    const token = await signAccessToken(CLAIMS);
    process.env.JWT_SECRET = "outro-segredo-outro-segredo-outro-segredo-outro";
    expect(await verifyToken(token)).toBeNull();
  });

  it("rejeita token adulterado (payload modificado)", async () => {
    const token = await signAccessToken(CLAIMS);
    const [header, , signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...CLAIMS, type: "access", role: "SUPER_ADMIN" }),
    ).toString("base64url");
    const tampered = `${header}.${tamperedPayload}.${signature}`;
    expect(await verifyToken(tampered)).toBeNull();
  });

  it("rejeita token expirado", async () => {
    const expired = await new SignJWT({ ...CLAIMS, type: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(CLAIMS.sub)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(TEST_SECRET));
    expect(await verifyToken(expired)).toBeNull();
  });

  it("rejeita token sem type=access (ex.: refresh disfarçado)", async () => {
    const notAccess = await new SignJWT({ ...CLAIMS, type: "refresh" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(CLAIMS.sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(TEST_SECRET));
    expect(await verifyToken(notAccess)).toBeNull();
  });

  it("rejeita string que não é um JWT", async () => {
    expect(await verifyToken("abc.def.ghi")).toBeNull();
    expect(await verifyToken("")).toBeNull();
  });
});