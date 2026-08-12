import { prisma } from "@/lib/db";
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
    const all = await prisma.lead.findMany({
      where: {
        OR: [
          { phone: { not: null } },
          { source: source },
        ],
      },
      select: { phone: true, name: true, city: true },
    });
    for (const l of all) {
      if (l.phone) existingPhones.add(normalizePhone(l.phone));
      existingNames.add(`${l.name.toLowerCase()}|${(l.city ?? "").toLowerCase()}`);
    }

    let saved = 0;
    let duplicates = 0;
    const toCreate: {
      name: string;
      phone: string | null;
      whatsapp: string | null;
      website: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      category: string | null;
      rating: number | null;
      reviews: number | null;
      source: string;
      sourceUrl: string | null;
    }[] = [];

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
      toCreate.push({
        name: lead.name,
        phone,
        whatsapp: lead.whatsapp ? normalizePhone(lead.whatsapp) : null,
        website,
        address: lead.address ?? null,
        city: lead.city ?? null,
        state: lead.state ?? null,
        category: lead.category ?? null,
        rating: lead.rating ?? null,
        reviews: lead.reviews ?? null,
        source,
        sourceUrl: lead.sourceUrl ?? null,
      });
    }

    if (toCreate.length > 0) {
      await prisma.lead.createMany({ data: toCreate });
      saved = toCreate.length;
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
