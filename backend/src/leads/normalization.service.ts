// Funções puras de normalização — testáveis sem infraestrutura.

export interface NormalizedDomain {
  domain: string;
  canonicalUrl: string | null;
}

/** Remove acentos e normaliza para lowercase, colapsando espaços. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza telefone para E.164 brasileiro (+55...).
 * Regras:
 *  - apenas dígitos contam (+, espaço, () são removidos)
 *  - 10-11 dígitos sem país → assume +55
 *  - 12-13 dígitos iniciando em 55 → mantém
 *  - qualquer outra forma → null (não é telefone BR válido)
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith("55")) return digits;
  }
  return null;
}

/** Verifica se o telefone (já E.164) é celular (9º dígito presente após DDD). */
export function isBrazilianMobile(e164: string): boolean {
  const local = e164.startsWith("55") ? e164.slice(2) : e164;
  if (local.length === 11) return true; // DDD + 9 dígitos
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

export function validateEmailSyntax(email: string): boolean {
  return EMAIL_RE.test(email);
}

/**
 * Normaliza domínio/URL:
 *  - extrai domínio registrável (sem protocolo/www)
 *  - devolve URL canônica com https quando possível
 */
export function normalizeDomain(raw: string | null | undefined): NormalizedDomain | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^[a-z]+:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let hostname: string;
  try {
    hostname = new URL(candidate).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!hostname || !hostname.includes(".")) return null;
  hostname = hostname.replace(/^www\./, "");

  const domainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  if (!domainRe.test(hostname)) return null;

  return { domain: hostname, canonicalUrl: `https://${hostname}` };
}

/** Hash estável de conteúdo — usado para detectar mensagens idênticas. */
export function hashContent(content: string): string {
  let h = 5381;
  const norm = content.toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < norm.length; i++) {
    h = (h * 33) ^ norm.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/** Normaliza handle de rede social (remove @, lowercase). */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,64}$/.test(h)) return null;
  return h;
}