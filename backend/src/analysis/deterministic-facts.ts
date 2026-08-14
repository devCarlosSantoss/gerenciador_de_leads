import type { FindingValueType, EvidenceSourceType, EvidenceType } from "@prisma/client";
import type { FindingPersistInput, EvidencePersistInput } from "./findings.service";

/**
 * Fatos determinísticos extraídos da auditoria (DNS, HTTP, HTML, PageSpeed)
 * e dos dados estruturados do lead. Nunca dependem da IA: cada fato aponta
 * para uma evidência coletada (url, métrica ou trecho de texto).
 */

export interface DeterministicFactsInput {
  websiteUrl?: string;
  dnsOk?: boolean;
  httpStatus?: number;
  checks?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  pageSpeedMetrics?: Record<string, unknown>;
  pageSpeedChecks?: Record<string, unknown>;
  websiteExists: boolean;
  websiteStatus?: string;
  hasWhatsappContact: boolean;
  hasValidContact: boolean;
  socialProfiles: { platform: string }[];
  reviewsCount?: number | null;
  rating?: number | null;
}

function fact(
  id: string,
  claim: string,
  value: unknown,
  valueType: FindingValueType,
  sourceType: EvidenceSourceType,
  evidence: EvidencePersistInput[],
): FindingPersistInput {
  return { id, category: "FACT", claim, value, valueType, sourceType, evidence };
}

function ev(
  sourceType: EvidenceSourceType,
  evidenceType: EvidenceType,
  data: Partial<EvidencePersistInput> = {},
): EvidencePersistInput {
  return { sourceType, evidenceType, ...data };
}

function boolChecks(checks: Record<string, unknown>, prefix: string, url: string | undefined): FindingPersistInput[] {
  const out: FindingPersistInput[] = [];
  const add = (
    key: string,
    claim: string,
    value: unknown,
    metricName?: string,
    metricValue?: number,
    extractedText?: string,
  ) => {
    const v = checks[key];
    if (v === undefined) return;
    out.push(
      fact(
        `${prefix}.${key}`,
        claim,
        value,
        typeof value === "boolean" ? "BOOLEAN" : typeof value === "number" ? "NUMBER" : "STRING",
        "HTML_ANALYSIS",
        [
          ev("HTML_ANALYSIS", "METRIC", {
            url,
            metricName: metricName ?? key,
            metricValue: metricValue ?? (typeof value === "number" ? value : undefined),
            extractedText,
          }),
        ],
      ),
    );
  };

  add("https", "O site está acessível via HTTPS", checks["https"] ? true : false);
  add("title", "A página possui título definido", (checks["title"] as { present?: boolean })?.present ?? null);
  add("metaDescription", "A página possui meta descrição", (checks["metaDescription"] as { present?: boolean })?.present ?? null);
  add("h1", "A página possui H1", ((checks["h1"] as { count?: number })?.count ?? 0) > 0, "h1.count", (checks["h1"] as { count?: number })?.count);
  add("viewport", "A página possui viewport (mobile)", (checks["viewport"] as { present?: boolean })?.present ?? null);
  add("forms", "A página possui formulário", ((checks["forms"] as { count?: number })?.count ?? 0) > 0, "forms.count", (checks["forms"] as { count?: number })?.count);

  const cb = checks["contactButton"] as Record<string, boolean> | undefined;
  if (cb) {
    add("contactButton.whatsapp", "A página possui botão/âncora de WhatsApp", cb.whatsapp ?? false, "contact.whatsapp", cb.whatsapp ? 1 : 0);
    add("contactButton.tel", "A página possui link de telefone (tel:)", cb.tel ?? false, "contact.tel", cb.tel ? 1 : 0);
    add("contactButton.email", "A página possui link de e-mail (mailto:)", cb.email ?? false, "contact.email", cb.email ? 1 : 0);
  }

  const cta = checks["cta"] as Record<string, boolean> | undefined;
  if (cta) {
    add("cta.agendar", "A página possui CTA de agendamento", cta.agendar ?? false);
    add("cta.orcamento", "A página possui CTA de orçamento", cta.orcamento ?? false);
    add("cta.contato", "A página possui CTA de contato", cta.contato ?? false);
  }

  const commerce = checks["commerce"] as Record<string, boolean> | undefined;
  if (commerce) {
    add("commerce.catalog", "A página divulga catálogo/produtos", commerce.catalog ?? false);
    add("commerce.checkout", "A página possui carrinho/checkout", commerce.checkout ?? false);
    add("commerce.payment", "A página menciona meios de pagamento", commerce.payment ?? false);
  }

  if (checks["robots"]) {
    add("robots", "O site responde em /robots.txt", Boolean(checks["robots"]));
  }
  return out;
}

export function buildDeterministicFindings(input: DeterministicFactsInput): FindingPersistInput[] {
  const out: FindingPersistInput[] = [];
  const url = input.websiteUrl;
  const checks = (input.checks ?? {}) as Record<string, unknown>;
  const metrics = (input.metrics ?? {}) as Record<string, unknown>;

  // Disponibilidade de contato (dados estruturados de importação — USER_INPUT).
  if (input.hasWhatsappContact) {
    out.push(
      fact(
        "contact.whatsapp.available",
        "O lead possui número de WhatsApp válido",
        true,
        "BOOLEAN",
        "USER_INPUT",
        [ev("USER_INPUT", "USER_INPUT", { extractedText: "Contato de WhatsApp validado na importação" })],
      ),
    );
  }
  if (input.hasValidContact) {
    out.push(
      fact(
        "contact.valid.available",
        "O lead possui ao menos um contato válido",
        true,
        "BOOLEAN",
        "USER_INPUT",
        [ev("USER_INPUT", "USER_INPUT", { extractedText: "Contato válido confirmado nos dados do lead" })],
      ),
    );
  }

  if (input.socialProfiles.length > 0) {
    out.push(
      fact(
        "social.profiles.present",
        "O lead possui perfis em redes sociais públicas",
        input.socialProfiles.length,
        "NUMBER",
        "SOCIAL_PUBLIC",
        [
          ev("SOCIAL_PUBLIC", "TEXT", {
            extractedText: `Perfis públicos: ${input.socialProfiles.map((s) => s.platform).join(", ")}`,
          }),
        ],
      ),
    );
  }

  if (typeof input.reviewsCount === "number") {
    out.push(
      fact(
        "reviews.count",
        `O lead possui ${input.reviewsCount} avaliações públicas`,
        input.reviewsCount,
        "NUMBER",
        "SOCIAL_PUBLIC",
        [
          ev("SOCIAL_PUBLIC", "METRIC", {
            metricName: "reviews.count",
            metricValue: input.reviewsCount,
          }),
        ],
      ),
    );
  }
  if (typeof input.rating === "number") {
    out.push(
      fact(
        "reviews.rating",
        `Avaliação média pública de ${input.rating} estrelas`,
        input.rating,
        "NUMBER",
        "SOCIAL_PUBLIC",
        [ev("SOCIAL_PUBLIC", "METRIC", { metricName: "reviews.rating", metricValue: input.rating })],
      ),
    );
  }

  if (!input.websiteExists) {
    out.push(
      fact(
        "website.none",
        "O lead não possui site próprio",
        true,
        "BOOLEAN",
        "WEBSITE_HTTP",
        [ev("WEBSITE_HTTP", "TEXT", { extractedText: "Nenhum domínio de site cadastrado para o lead" })],
      ),
    );
    return out;
  }

  if (input.websiteStatus === "NO_WEBSITE") {
    out.push(
      fact(
        "website.none",
        "O lead não possui site próprio",
        true,
        "BOOLEAN",
        "WEBSITE_HTTP",
        [ev("WEBSITE_HTTP", "TEXT", { extractedText: "Nenhum domínio de site cadastrado para o lead" })],
      ),
    );
  }

  // DNS (fonte determinística).
  if (typeof input.dnsOk === "boolean") {
    out.push(
      fact(
        "dns.ok",
        input.dnsOk ? "O domínio do site resolve corretamente" : "O domínio do site não resolve",
        input.dnsOk,
        "BOOLEAN",
        "DNS",
        [
          ev("DNS", "METRIC", {
            url,
            metricName: "dns.ok",
            metricValue: input.dnsOk ? 1 : 0,
          }),
        ],
      ),
    );
  }

  if (typeof input.httpStatus === "number") {
    out.push(
      fact(
        "http.status",
        `O site respondeu HTTP ${input.httpStatus}`,
        input.httpStatus,
        "NUMBER",
        "WEBSITE_HTTP",
        [ev("WEBSITE_HTTP", "METRIC", { url, metricName: "http.status", metricValue: input.httpStatus })],
      ),
    );
  }

  if (typeof metrics.htmlBytes === "number") {
    out.push(
      fact(
        "http.html_bytes",
        `A página principal tem ${metrics.htmlBytes} bytes de HTML`,
        metrics.htmlBytes,
        "NUMBER",
        "WEBSITE_HTTP",
        [ev("WEBSITE_HTTP", "METRIC", { url, metricName: "html.bytes", metricValue: metrics.htmlBytes as number })],
      ),
    );
  }

  // Checks de HTML (fonte determinística).
  for (const f of boolChecks(checks, "html", url)) out.push(f);

  // PageSpeed Insights (fonte determinística — PAGESPEED).
  const ps = (input.pageSpeedMetrics ?? {}) as Record<string, unknown>;
  if (typeof ps.performanceScore === "number") {
    out.push(
      fact(
        "pagespeed.performance",
        `Performance mobile (PageSpeed) de ${Math.round((ps.performanceScore as number) * 100)}`,
        ps.performanceScore,
        "METRIC",
        "PAGESPEED",
        [ev("PAGESPEED", "METRIC", { url, metricName: "pagespeed.performance_score", metricValue: ps.performanceScore as number })],
      ),
    );
  }
  const psChecks = (input.pageSpeedChecks ?? {}) as Record<string, unknown>;
  if (psChecks.performanceLabel) {
    out.push(
      fact(
        "pagespeed.experience_label",
        `Experiência mobile classificada como "${psChecks.performanceLabel}"`,
        String(psChecks.performanceLabel),
        "STRING",
        "PAGESPEED",
        [ev("PAGESPEED", "TEXT", { url, extractedText: `Label de experiência: ${psChecks.performanceLabel}` })],
      ),
    );
  }

  return out;
}