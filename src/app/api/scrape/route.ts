import { scrapeLeads } from "@/lib/scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const provider = body.provider === "url" ? "url" : "google_maps";
    const query = String(body.query ?? "").trim();
    const location = String(body.location ?? "").trim();
    const maxResults = Math.min(60, Math.max(1, parseInt(body.maxResults) || 20));

    if (provider === "google_maps" && !query) {
      return Response.json(
        { error: "Informe o que deseja buscar (ex.: encanador, restaurante, clínica...)" },
        { status: 400 }
      );
    }

    const { leads } = await scrapeLeads(provider, { query, location, maxResults });
    return Response.json({ leads, count: leads.length });
  } catch (err) {
    console.error("[api/scrape]", err);
    const message =
      err instanceof Error
        ? err.message
        : "Erro ao capturar leads. Tente novamente.";
    return Response.json({ error: message }, { status: 500 });
  }
}
