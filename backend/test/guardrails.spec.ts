import { describe, expect, it } from "vitest";
import { GuardrailsService } from "../src/ai/guardrails.service";

const guardrails = new GuardrailsService();

describe("GuardrailsService.check", () => {
  it("aceita mensagem válida com evidência", () => {
    const text =
      "Olá, Mecânica Silva! Sou da Aurora Code Tech. Vi que o site de vocês não tem agendamento online. Posso te mostrar como o WhatsApp pode agendar visitas? Se não for prioridade, sem problema.";
    const verdict = guardrails.check(text, "medium", [
      "agendamento online",
      "mecânica silva",
    ]);
    expect(verdict.ok).toBe(true);
  });

  it("bloqueia frase proibida", () => {
    const text = "URGENTE: oferta por tempo limitado! Aproveite agora!";
    const verdict = guardrails.check(text, "short", ["urgente"]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("urgente");
  });

  it("bloqueia excesso de emojis", () => {
    const text = "🎉🎉🎉 Oferta especial! 🚀🚀";
    const verdict = guardrails.check(text, "short", ["oferta"]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("emojis");
  });

  it("bloqueia mais de uma pergunta", () => {
    const text = "Você tem site? Quer melhorá-lo? Podemos agendar?";
    const verdict = guardrails.check(text, "medium", ["site"]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("pergunta");
  });

  it("bloqueia mensagem sem evidência de personalização", () => {
    const text = "Olá! Somos uma agência digital. Gostaria de conhecer nossos serviços?";
    const verdict = guardrails.check(text, "medium", ["mecânica silva", "agendamento"]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("evidência");
  });

  it("bloqueia exceder limite de caracteres", () => {
    const long = "a".repeat(310);
    const verdict = guardrails.check(long, "short", ["a"]);
    expect(verdict.ok).toBe(false);
  });

  it("permite até 1 emoji", () => {
    const text = "Olá! 😊 Posso te ajudar com isso?";
    const verdict = guardrails.check(text, "short", ["ajudar"]);
    expect(verdict.ok).toBe(true);
  });
});