import { importLeadsToBackend, type BackendImportItem } from "@/lib/prospecting";
import { normalizePhone } from "@/lib/constants";
import type { ScrapedLead } from "@/lib/scraper/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const leads: ScrapedLead[] = Array.isArray(body.leads) ? body.leads : [];
    const source = body.source === "url" ? "site" : "google_maps";

    if (leads.length === 0) {
      return Response.json({ error: "Nenhum lead para salvar" }, { status: 400 });
    }

    const existingPhones = new Set<string>();
    const existingNames = new Set<string>();

    // Note: This would need backend API to check existing leads
    // For now, we'll deduplicate locally and let backend handle conflicts

    let saved = 0;
    let duplicates = 0;
    const items: BackendImportItem[] = [];

    for (const lead of leads) {
      if (!lead.name) continue;
      const phone = lead.phone ? normalizePhone(lead.phone) : null;
      const website = typeof lead.website === "string" && lead.website.trim()
        ? lead.website.trim()
        : null;
      const nameKey = `${lead.name.toLowerCase()}|${(lead.city ?? "").toLowerCase()}`;
      if (phone && existingPhones.has(phone)) {
        duplicates++;
        continue;
      }
      if (existingNames.has(nameKey)) {
        duplicates++;
        continue;
      }
      if (phone) existingPhones.add(phone);
      existingNames.add(nameKey);

      const contacts: BackendImportItem["contacts"] = [];
      if (phone) contacts.push({ type: "PHONE", value: phone });
      if (lead.whatsapp) contacts.push({ type: "WHATSAPP", value: normalizePhone(lead.whatsapp) });

      items.push({
        sourceKey: source,
        sourceUrl: lead.sourceUrl ?? null,
        externalId: null,
        collectedAt: new Date().toISOString(),
        company: {
          name: lead.name,
          category: lead.category ?? null,
          address: lead.address ?? null,
          city: lead.city ?? null,
          state: lead.state ?? null,
          website,
          phone,
          whatsapp: lead.whatsapp ? normalizePhone(lead.whatsapp) : null,
          rating: lead.rating ?? null,
          reviewsCount: lead.reviews ?? null,
        },
        contacts,
      });
    }

    if (items.length > 0) {
      const result = await importLeadsToBackend(items);
      saved = result.accepted;
    }

    return Response.json({
      saved,
      duplicates,
      total: leads.length,
      skipped: leads.length - saved - duplicates,
    });
  } catch (err) {
    console.error("[api/leads/batch]", err);
    return Response.json({ error: "Erro ao salvar leads" }, { status: 500 });
  }
}