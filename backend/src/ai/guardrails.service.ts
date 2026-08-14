import { Injectable } from "@nestjs/common";

export const BLOCKED_PHRASES = [
  "urgente",
  "só hoje",
  "somente hoje",
  "oferta por tempo limitado",
  "tempo limitado",
  "não perca",
  "não perca esta oportunidade",
  "perfeito para você",
  "solução perfeita",
  "tenho a solução perfeita",
  "milagre",
  "resultados garantidos",
  "garantido",
  "lucro imediato",
  "seu concorrente está ganhando",
];

export const LENGTH_CAPS = { short: 300, medium: 450, long: 600 } as const;
export const MAX_EMOJIS = 2;

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "em", "no", "na", "um", "uma", "uns", "umas",
  "e", "o", "a", "os", "as", "para", "com", "que", "ao", "aos", "se", "por",
  "mais", "já", "ja", "não", "nao", "atual", "atualmente", "disponível",
  "disponivel", "possível", "possivel", "estrutura", "atual",
]);

/** Extrai termos significativos de uma frase de evidência (meta-descrição). */
export function keywordsFromEvidence(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export interface GuardrailVerdict {
  ok: boolean;
  reasons: string[];
}

/**
 * Guardrails de mensagens — aplicados no CÓDIGO, fora do LLM
 * (bloqueios da seção 6.3 do plano técnico).
 */
@Injectable()
export class GuardrailsService {
  check(text: string, length: keyof typeof LENGTH_CAPS, evidence: string[]): GuardrailVerdict {
    const reasons: string[] = [];
    const lower = text.toLowerCase();

    if (text.length > LENGTH_CAPS[length]) reasons.push(`excede ${LENGTH_CAPS[length]} caracteres`);

    for (const phrase of BLOCKED_PHRASES) {
      if (lower.includes(phrase)) reasons.push(`frase bloqueada: "${phrase}"`);
    }

    const emojis = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
    if (emojis > MAX_EMOJIS) reasons.push(`muitos emojis (${emojis})`);

    // A saudação "tudo bem?" é parte da abertura humana, não conta como pergunta.
    const withoutGreeting = text.toLowerCase().replace(/tudo bem\s*\?/g, "");
    const questions =
      (withoutGreeting.match(/\?\s/g) ?? []).length +
      (withoutGreeting.trim().endsWith("?") ? 1 : 0);
    if (questions > 1) reasons.push("mais de uma pergunta");

    // Personalização: a mensagem deve conter ao menos UM termo significativo de
    // alguma evidência (a frase inteira raramente aparece literal no texto).
    const evidenceHits = evidence.filter((e) =>
      keywordsFromEvidence(e).some((k) => lower.includes(k)),
    ).length;
    if (evidenceHits === 0) reasons.push("não usa nenhuma evidência de personalização");

    return { ok: reasons.length === 0, reasons };
  }
}