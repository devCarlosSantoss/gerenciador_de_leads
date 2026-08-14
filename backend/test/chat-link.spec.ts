import { describe, expect, it } from "vitest";
import { buildWaMeUrl } from "../src/messages/messages.service";

describe("buildWaMeUrl", () => {
  it("usa o número em E.164 sem o símbolo +", () => {
    const url = buildWaMeUrl("+5511987654321", "Olá");
    expect(url).toBe(
      "https://wa.me/5511987654321?text=Ol%C3%A1",
    );
  });

  it("codifica corretamente a mensagem (acentos, quebras e espaços)", () => {
    const url = buildWaMeUrl("5511987654321", "Oi Ana,\nsegue proposta para vocês.");
    expect(url).toBe(
      "https://wa.me/5511987654321?text=Oi%20Ana%2C%0Asegue%20proposta%20para%20voc%C3%AAs.",
    );
  });

  it("aceita texto vazio sem quebrar o query string", () => {
    const url = buildWaMeUrl("5511987654321", "");
    expect(url).toBe("https://wa.me/5511987654321?text=");
  });
});
