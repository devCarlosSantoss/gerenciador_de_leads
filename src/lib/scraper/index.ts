import { scrapeGoogleMaps, type ScrapeOptions } from "./google-maps";
import type { ScrapedLead } from "./types";

export async function scrapeLeads(
  provider: string,
  opts: ScrapeOptions & { url?: string }
): Promise<{ provider: string; leads: ScrapedLead[] }> {
  switch (provider) {
    case "google_maps":
      return { provider: "google_maps", leads: await scrapeGoogleMaps(opts) };
    default:
      throw new Error(`Provedor de captura não suportado: ${provider}`);
  }
}
