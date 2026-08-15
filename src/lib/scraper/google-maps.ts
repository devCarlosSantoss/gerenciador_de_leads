import { chromium, type Page, type Browser } from "playwright";
import type { ScrapedLead } from "./types";

const MAX_RETRIES = 2;

if (process.env.RENDER) {
  process.env["PLAYWRIGHT_BROWSERS_PATH"] = "0";
}

function parseAddressParts(address: string): {
  city?: string;
  state?: string;
} {
  const parts = address.split(" - ");
  const last = parts[parts.length - 1]?.trim() ?? "";
  const m = last.match(/^([A-Za-zÀ-ú\s]+?)\s*\/\s*([A-Z]{2})$/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  if (parts.length > 1) {
    const penultimate = parts[parts.length - 2]?.trim();
    if (penultimate && !penultimate.includes(",")) {
      const cm = penultimate.match(/^([A-Za-zÀ-ú\s]+?)\s*\/\s*([A-Z]{2})$/);
      if (cm) return { city: cm[1].trim(), state: cm[2].toUpperCase() };
      return { city: penultimate };
    }
  }
  return {};
}

async function dismissConsent(page: Page) {
  try {
    const btn = page
      .getByRole("button", { name: /aceitar|accept|concordo|agree|rejeitar|reject/i })
      .first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => {});
    }
  } catch {
    /* consent dialog not present */
  }
}

async function scrollFeed(page: Page, desired: number, maxScrolls: number) {
  const feed = page.locator('div[role="feed"]').first();
  for (let i = 0; i < maxScrolls; i++) {
    const count = await page
      .locator('div[role="feed"] a[href*="/maps/place"]')
      .count()
      .catch(() => 0);
    if (count >= desired) break;
    try {
      await feed.evaluate((el) => {
        el.scrollBy(0, el.scrollHeight);
      });
    } catch {
      await page.mouse.wheel(0, 800);
    }
    await page.waitForTimeout(900);
  }
}

type Card = {
  name?: string;
  rating?: number;
  reviews?: number;
  address?: string;
  phone?: string;
  website?: string;
  href?: string;
  category?: string;
  rawText?: string;
};

const EXTRACT_CARDS_FN = `function(urls) {
  const norm = (s) =>
    (s || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").trim();
  const find = (root, selectors) => {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el && el.textContent && el.textContent.trim()) return norm(el.textContent);
    }
    return null;
  };
  const parseRating = (text) => {
    const out = {};
    const star = text.match(/(\\d+[,.]\\d+)/);
    if (star) out.rating = parseFloat(star[1].replace(",", "."));
    const rev = text.match(/\\((\\d+)\\)/);
    if (rev) out.reviews = parseInt(rev[1]);
    return out;
  };
  const cleanNumber = (text) => text.replace(/\\D/g, "");
  const cards = [];
  const seen = new Set();
  for (const href of urls) {
    const a = Array.from(document.querySelectorAll('a[href*="/maps/place"]')).find(
      (el) => el.href === href
    );
    if (!a) continue;
    const container =
      a.closest('[role="feed"] > div, [role="article"], div.Nv2PK') ??
      a.parentElement?.parentElement?.parentElement ??
      null;
    const root = container ?? a.parentElement;
    const name =
      find(root, [
        "div.qBF1Pd",
        "div.fontHeadlineSmall",
        "h3",
        'a[href*="/maps/place"] span[aria-hidden="true"]',
        "div.Cw1rxd",
      ]) || norm(a.getAttribute("aria-label") || "");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const ratingText =
      find(root, ["span.MW4etd", "div.MW4etd", "span[aria-label*='estrela']"]) || "";
    const reviewsText = find(root, ["span.UY7F9"]) || "";
    const { rating, reviews } = parseRating(ratingText + " " + reviewsText);
    const lines = (root.innerText || "")
      .split("\\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const fullText = norm(lines.join(" ") + " " + (root.textContent || ""));
    const phoneLine = lines.find(
      (l) => /\\(?\\d{2,3}\\)?\\s?\\d{4,5}[-\\s]?\\d{4}\\b/.test(l)
    );
    const phoneMatch = (phoneLine || fullText).match(
      /(?:\\+?55[\\s(]?)?\\(?\\d{2,3}\\)?\\s?\\d{4,5}[-\\s]?\\d{4}\\b/
    );
    const phone = phoneMatch ? phoneMatch[0].replace(/\\D/g, "") : undefined;
    const website =
      (() => {
        const external = Array.from(root.querySelectorAll("a[href]"))
          .map((a) => (a.getAttribute("href") || "").trim())
          .filter((href) => /^https?:\\/\\//i.test(href))
          .filter(
            (href) =>
              !/^https?:\\/\\/(www\\.)?(google\\.[a-z.]+|g\\.co|maps\\.google|accounts\\.google)/i.test(
                href
              )
          );
        if (external.length) return external[0];
        const explicit = fullText.match(/https?:\\/\\/[^\\s"<>]+/);
        if (explicit) return explicit[0];
        const bare = fullText.match(
          /\\b(?:www\\.)?[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]{2,})+\\.(?:com|net|org|com\\.br|net\\.br|org\\.br|gov\\.br|me|io|app|dev|co|online|store|site)(?:\\/[^\\s"<>]*)?/i
        );
        if (bare) return /^https?:\\/\\//i.test(bare[0]) ? bare[0] : ("https://" + bare[0]);
        return undefined;
      })();
    const addressMatch = lines.find(
      (l) =>
        /^(R\\.|Rua|Av\\.|Avenida|Al\\.|Alameda|Praça|Pça|Travessa|Rod\\.|Rodovia|Estrada|Est\\.|Via|R$)\\b/i.test(
          l
        ) ||
        (l.includes(",") &&
          /\\d/.test(l) &&
          !l.startsWith("+") &&
          !/^\\d+[,.]\\d+$/.test(l) &&
          !/\\(\\d{2,3}\\)/.test(l))
    );
    const address = addressMatch
      ? addressMatch
          .split(" · ")
          .map((s) => s.trim())
          .find(
            (part) =>
              /^(R\\.|Rua|Av\\.|Avenida|Al\\.|Alameda|Praça|Pça|Travessa|Rod\\.|Rodovia|Estrada|Est\\.|Via)/i.test(
                part
              ) || (part.includes(",") && /\\d/.test(part))
          ) || addressMatch
      : undefined;
    const categoryText = find(root, ["button[jsaction*='category']", "div[class*='fontBodySmall']"]);
    const category = categoryText && !categoryText.match(/(^\\d|\\d$)/) ? categoryText : undefined;
    cards.push({ name, rating, reviews, address, phone, website, href, category, rawText: fullText.slice(0, 600) });
  }
  return cards;
}`;

async function extractCards(page: Page, hrefs: string[]): Promise<Card[]> {
  const results = (await page.evaluate(
    `((${EXTRACT_CARDS_FN})(${JSON.stringify(hrefs)}))`
  )) as Card[];
  return results;
}

function toLead(card: Card, query: string): ScrapedLead {
  const address = card.address;
  const addrParts = address ? parseAddressParts(address) : {};
  let whatsapp: string | undefined;
  if (card.phone && /^\d{10,11}$/.test(card.phone)) whatsapp = card.phone;
  return {
    name: card.name!,
    phone: card.phone,
    whatsapp,
    website: card.website,
    address,
    city: addrParts.city,
    state: addrParts.state,
    category: card.category || query,
    rating: card.rating,
    reviews: card.reviews,
    sourceUrl: card.href,
    rawText: card.rawText,
  };
}

export type ScrapeOptions = {
  query: string;
  location?: string;
  maxResults?: number;
};

export async function scrapeGoogleMaps(opts: ScrapeOptions): Promise<ScrapedLead[]> {
  const maxResults = Math.min(60, opts.maxResults ?? 25);
  let browser: Browser | null = null;
  let leads: ScrapedLead[] = [];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        locale: "pt-BR",
        viewport: { width: 1280, height: 800 },
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      });
      const page = await context.newPage();

      const searchTerm = [opts.query, opts.location].filter(Boolean).join(" ");
      const url = `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}/`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await dismissConsent(page);

      await page
        .locator('div[role="feed"]')
        .first()
        .waitFor({ timeout: 15000 });

      await scrollFeed(page, maxResults, 30);

      const hrefs = await page
        .locator('div[role="feed"] a[href*="/maps/place"]')
        .evaluateAll((els) =>
          Array.from(new Set(els.map((el) => (el as HTMLAnchorElement).href)))
        )
        .catch(() => [] as string[]);

      const cards = await extractCards(page, hrefs.slice(0, maxResults));

      leads = cards
        .filter((c) => c.name)
        .map((c) => {
          const lead = toLead(c, opts.query);
          if (!lead.city && opts.location) lead.city = opts.location;
          return lead;
        });
      break;
    } catch (err) {
      console.error(`[scraper] attempt ${attempt + 1} failed:`, err);
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(
          "Não foi possível capturar do Google Maps. Pode ser bloqueio temporário ou problema de rede. Tente novamente."
        );
      }
      await new Promise((r) => setTimeout(r, 3000));
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  const seen = new Set<string>();
  return leads.filter((l) => {
    const key = `${l.name.toLowerCase()}|${l.address ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
