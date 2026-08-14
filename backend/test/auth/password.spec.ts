import { describe, expect, it } from "vitest";
import { PasswordService } from "../../src/auth/password.service";

const passwords = new PasswordService();

describe("PasswordService.isStrong", () => {
  it("rejeita senha curta", () => {
    const r = passwords.isStrong("Abc!123");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("12");
  });

  it("rejeita senha longa demais", () => {
    const r = passwords.isStrong("A1!".padEnd(200, "a"));
    expect(r.ok).toBe(false);
  });

  it("rejeita senha com poucas classes de caracteres", () => {
    expect(passwords.isStrong("abcdefghijklmnop").ok).toBe(false); // só minúsculas
    expect(passwords.isStrong("ABCDEFGHIJKLMNO").ok).toBe(false); // só maiúsculas
    expect(passwords.isStrong("abcdefghijk123").ok).toBe(false); // min + dígitos (2 classes)
  });

  it("aceita senha forte com 3+ classes", () => {
    expect(passwords.isStrong("Abcdefghijk123").ok).toBe(true); // min+mai+dig
    expect(passwords.isStrong("abcdefghijk123!").ok).toBe(true); // min+dig+sym
    expect(passwords.isStrong("Ab1!efghijklmn").ok).toBe(true);
  });
});

describe("PasswordService hash/verify (Argon2id)", () => {
  it("gera hash Argon2id e verifica a senha", async () => {
    const hash = await passwords.hash("Senha-*Forte-2026!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await passwords.verify(hash, "Senha-*Forte-2026!")).toBe(true);
    expect(await passwords.verify(hash, "senha-diferente")).toBe(false);
  });

  it("nunca armazena a senha em texto puro", async () => {
    const hash = await passwords.hash("Segredo-Super-1");
    expect(hash.includes("Segredo-Super-1")).toBe(false);
  });

  it("cada hash é único (salt aleatório)", async () => {
    const a = await passwords.hash("Mesma-Senha-123!");
    const b = await passwords.hash("Mesma-Senha-123!");
    expect(a).not.toBe(b);
  });
});

describe("PasswordService token helpers", () => {
  it("hashToken é determinístico (sha256 hex)", () => {
    expect(passwords.hashToken("abc")).toBe(passwords.hashToken("abc"));
    expect(passwords.hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateToken produz valores longos e diferentes", () => {
    const a = passwords.generateToken(32);
    const b = passwords.generateToken(32);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(b);
  });

  it("timingSafeDummyVerify não lança", async () => {
    await expect(passwords.timingSafeDummyVerify()).resolves.toBeUndefined();
  });
});