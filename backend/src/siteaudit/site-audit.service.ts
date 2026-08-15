import { Injectable, Logger } from "@nestjs/common";
import dns from "node:dns/promises";
import { PrismaService } from "../prisma/prisma.service";
import { config } from "../config/env";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000;

export interface AuditResult {
  tool: string;
  metrics: Record<string, unknown>;
  checks: Record<string, unknown>;
  errors: string[];
  websiteStatus: "ACTIVE" | "UNREACHABLE" | "PARKED";
}

@Injectable()
export class SiteAuditService {
  private readonly logger = new Logger(SiteAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async audit(websiteId: string): Promise<AuditResult> {
    const website = await this.prisma.leadWebsite.findUnique({ where: { id: websiteId } });
    if (!website) throw new Error(`Website ${websiteId} não encontrado`);

    const result: AuditResult = {
      tool: "deterministic_v1",
      metrics: {},
      checks: {},
      errors: [],
      websiteStatus: "UNREACHABLE",
    };

    let dnsOk = false;
    try {
      await dns.resolve4(website.domain);
      dnsOk = true;
      result.checks.dns = { ok: true };
    } catch {
      result.checks.dns = { ok: false, note: "domínio não resolve" };
      result.errors.push("dns_failed");
    }
    if (!dnsOk) {
      await this.save(websiteId, result);
      return result;
    }

    const html = await this.fetchHtml(website.url, result);
    if (html === null) {
      result.websiteStatus = "UNREACHABLE";
      await this.save(websiteId, result);
      return result;
    }

    result.websiteStatus = this.classifyParked(html) ? "PARKED" : "ACTIVE";

    const lower = html.toLowerCase();
    result.checks.https = { ok: website.url.startsWith("https://"), tlsValid: website.tlsValid ?? null };
    result.checks.title = { present: /<title[^>]*>([^<]{1,})<\/title>/i.test(html), length: (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim().length };
    result.checks.metaDescription = { present: /<meta[^>]+name=["']description["'][^>]*>/i.test(html) };
    result.checks.h1 = { count: (html.match(/<h1[\s>]/gi) ?? []).length };
    result.checks.viewport = { present: /<meta[^>]+name=["']viewport["']/i.test(html) };
    result.checks.contactButton = {
      whatsapp: /(wa\.me\/|\?wa=|whatsapp\.com\/send)/i.test(lower),
      tel: /href=["']tel:/i.test(lower),
      email: /href=["']mailto:/i.test(lower),
    };
    result.checks.forms = { count: (html.match(/<form[\s>]/gi) ?? []).length };
    result.checks.cta = {
      agendar: /\bagendar\b/i.test(lower),
      orcamento: /\bor[çc]amento\b/i.test(lower),
      contato: /\bentre em contato\b|\bfale conosco\b/i.test(lower),
    };
    result.checks.commerce = {
      catalog: /\bcatalogo\b|\bcat[áa]logo\b|\bprodutos\b/i.test(lower),
      checkout: /\bcarrinho\b|\bcheckout\b|\badicionar ao carrinho\b/i.test(lower),
      payment: /\b(mercado pago|pagseguro|pix|gateway)\b/i.test(lower),
    };
    result.checks.robots = await this.hasRobots(website.url);
    result.metrics.htmlBytes = Buffer.byteLength(html);
    result.metrics.contentChars = html.length;

    if (config.PAGESPEED_API_KEY) {
      const ps = await this.pageSpeedMobile(website.url);
      if (ps) {
        result.metrics.pageSpeed = ps.metrics;
        result.checks.pageSpeed = ps.checks;
        result.tool = "deterministic_v1+pagespeed";
      } else {
        result.errors.push("pagespeed_unavailable");
      }
    }

    await this.save(websiteId, result);
    return result;
  }

  private async fetchHtml(url: string, result: AuditResult): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "aurora-prospecting-audit/1.0 (site analysis)" },
      });
      result.metrics.httpStatus = res.status;
      result.checks.httpStatus = { code: res.status };
      if (!res.ok) {
        if (res.status >= 400) result.errors.push(`http_${res.status}`);
        return null;
      }
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_HTML_BYTES) {
        result.errors.push("html_too_large");
        return null;
      }
      return Buffer.from(buffer).toString("utf8");
    } catch (err) {
      result.errors.push(`fetch_failed:${(err as Error).name}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private classifyParked(html: string): boolean {
    if (html.length < 300) return true;
    const lower = html.toLowerCase();
    const parked = /domain\s+parked|parked\s+domain|is\s+for\s+sale|registrado\s+via|página\s+em\s+construção|under\s+construction/i;
    return parked.test(lower) && html.length < 1500;
  }

  private async hasRobots(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${url}/robots.txt`, {
        signal: controller.signal,
        headers: { "user-agent": "aurora-prospecting-audit/1.0" },
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async pageSpeedMobile(url: string) {
    const target = encodeURIComponent(url);
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${target}&strategy=mobile&key=${config.PAGESPEED_API_KEY}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { displayValue?: string; score?: number | null; title?: string }> };
        loadingExperience?: { metrics?: Record<string, { percentile?: number; category?: string }> };
      };
      const audits = data.lighthouseResult?.audits ?? {};
      const metrics = {
        performanceScore: data.lighthouseResult?.categories?.performance?.score,
        fcp: audits["first-contentful-paint"]?.displayValue,
        lcp: audits["largest-contentful-paint"]?.displayValue,
        tbt: audits["total-blocking-time"]?.displayValue,
        cls: audits["cumulative-layout-shift"]?.displayValue,
        mobileFriendly: !audits["is-crawlable"] || true,
      };
      const checks = {
        performanceLabel: data.loadingExperience?.metrics?.["INTERACTION_TO_NEXT_PAINT"]?.category ?? null,
      };
      return { metrics, checks };
    } catch (err) {
      this.logger.warn(`PageSpeed indisponível: ${(err as Error).message}`);
      return null;
    }
  }

  private async save(websiteId: string, result: AuditResult): Promise<void> {
    await this.prisma.websiteAudit.create({
      data: {
        websiteId,
        tool: result.tool,
        metrics: result.metrics as never,
        checks: result.checks as never,
        errors: result.errors,
      },
    });
    await this.prisma.leadWebsite.update({
      where: { id: websiteId },
      data: { status: result.websiteStatus, lastFetchedAt: new Date(), httpStatus: result.metrics.httpStatus as number | null ?? null },
    });
    await this.prisma.lead.updateMany({
      where: { websites: { some: { id: websiteId } } },
      data: { websiteStatus: result.websiteStatus },
    });
  }
}