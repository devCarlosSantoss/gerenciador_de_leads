// Sanitização de evidências coletadas e hash de integridade.
// Regras: nunca armazenar HTML cru, remover PII, limitar tamanho, gerar hash
// para detectar alteração da evidência.

export const EVIDENCE_TEXT_MAX = 2000;
export const EVIDENCE_CLAIM_MAX = 500;
export const EVIDENCE_SELECTOR_MAX = 500;
export const EVIDENCE_URL_MAX = 2048;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /\+?\(?\d{2,3}\)?[\s.-]?\d{3,5}[\s.-]?\d{4,5}/g;

/**
 * Remove tags HTML e caracteres de controle, colapsa espaços e limita o tamanho.
 * Saída é texto plano seguro para persistir e exibir.
 */
export function sanitizeText(raw: string | null | undefined, max = EVIDENCE_TEXT_MAX): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]*>/g, " ") // remove tags HTML
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // controles
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Remove dados sensíveis (e-mails e telefones) de textos coletados do site.
 * Evita persistir PII desnecessária nas evidências.
 */
export function stripPII(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[telefone]");
}

/** Sanitiza e remove PII em uma única operação. */
export function cleanEvidenceText(raw: string | null | undefined, max = EVIDENCE_TEXT_MAX): string {
  return stripPII(sanitizeText(raw, max));
}

/** Hash determinístico de conteúdo da evidência — detecta alteração. */
export function hashEvidence(input: {
  url?: string | null;
  extractedText?: string | null;
  metricName?: string | null;
  metricValue?: number | null;
  selector?: string | null;
}): string {
  const parts = [
    input.url ?? "",
    input.extractedText ?? "",
    input.metricName ?? "",
    input.metricValue === undefined || input.metricValue === null ? "" : String(input.metricValue),
    input.selector ?? "",
  ];
  let h = 5381;
  for (const part of parts) {
    const norm = part.toLowerCase().replace(/\s+/g, " ").trim();
    for (let i = 0; i < norm.length; i++) {
      h = (h * 33) ^ norm.charCodeAt(i);
    }
    h = (h * 33) ^ 0x7f;
  }
  return (h >>> 0).toString(36);
}