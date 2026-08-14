import { describe, expect, it } from "vitest";
import {
  normalizeName,
  normalizePhoneE164,
  normalizeEmail,
  normalizeDomain,
  normalizeHandle,
  isBrazilianMobile,
  hashContent,
} from "../src/leads/normalization.service";

describe("normalizePhoneE164", () => {
  it("adiciona +55 em número nacional com 10 dígitos", () => {
    expect(normalizePhoneE164("(11) 3456-7890")).toBe("551134567890");
  });
  it("adiciona +55 em número móvel com 11 dígitos", () => {
    expect(normalizePhoneE164("(11) 91234-5678")).toBe("5511912345678");
  });
  it("mantém número já com 55", () => {
    expect(normalizePhoneE164("+55 11 91234-5678")).toBe("5511912345678");
  });
  it("rejeita formato inválido", () => {
    expect(normalizePhoneE164("123")).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
  });
});

describe("isBrazilianMobile", () => {
  it("identifica celular pelo 9º dígito", () => {
    expect(isBrazilianMobile("5511912345678")).toBe(true);
    expect(isBrazilianMobile("551134567890")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("normaliza para lowercase", () => {
    expect(normalizeEmail("  Contato@Exemplo.COM ")).toBe("contato@exemplo.com");
  });
  it("rejeita e-mail sem formato", () => {
    expect(normalizeEmail("nao-e-email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
  });
});

describe("normalizeDomain", () => {
  it("canonicaliza www e protocolo", () => {
    expect(normalizeDomain("www.MecanicaSilva.com.br")).toEqual({
      domain: "mecanicasilva.com.br",
      canonicalUrl: "https://mecanicasilva.com.br",
    });
  });
  it("rejeita domínio inválido", () => {
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
  });
});

describe("normalizeName", () => {
  it("remove acentos e colapsa espaços", () => {
    expect(normalizeName("  Mecânica   Silva Ltda. ")).toBe("mecanica silva ltda");
  });
});

describe("normalizeHandle", () => {
  it("remove @ e lowercase", () => {
    expect(normalizeHandle("@Mecanica_Silva")).toBe("mecanica_silva");
  });
});

describe("hashContent", () => {
  it("é estável e insensível a espaços/caixa", () => {
    expect(hashContent("Olá Mundo")).toBe(hashContent("  olá  mundo "));
  });
});