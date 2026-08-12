import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/ç/g, "c")
    .replace(/ã|á|à/g, "a")
    .replace(/é|ê/g, "e")
    .replace(/í/g, "i")
    .replace(/ó|ô/g, "o")
    .replace(/ú/g, "u");
}

const STATUS_VALUES = [
  "NOVO",
  "CONTATADO",
  "QUALIFICADO",
  "PERDIDO",
  "CONVERTIDO",
] as const;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Envie um arquivo CSV" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      return Response.json({ error: "CSV vazio ou sem dados" }, { status: 400 });
    }

    const header = rows[0].map(normalizeHeader);
    const col = (h: string) => header.indexOf(normalizeHeader(h));

    const idx = {
      name: col("nome"),
      company: col("empresa"),
      email: col("email"),
      phone: col("telefone"),
      whatsapp: col("whatsapp"),
      website: col("website"),
      address: col("endereco"),
      city: col("cidade"),
      state: col("uf"),
      category: col("categoria"),
      rating: col("avaliacao"),
      reviews: col("avaliacoes"),
      status: col("status"),
      tags: col("tags"),
      source: col("origem"),
      sourceUrl: col("link_origem"),
      notes: col("notas"),
    };

    if (idx.name === -1) {
      return Response.json(
        { error: 'Coluna "nome" não encontrada no CSV' },
        { status: 400 }
      );
    }

    const records = rows
      .slice(1)
      .map((r) => {
        const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
        return {
          name: get(idx.name),
          company: get(idx.company) || null,
          email: get(idx.email) || null,
          phone: normalizePhone(get(idx.phone)) || null,
          whatsapp: normalizePhone(get(idx.whatsapp)) || null,
          website: get(idx.website) || null,
          address: get(idx.address) || null,
          city: get(idx.city) || null,
          state: get(idx.state).toUpperCase() || null,
          category: get(idx.category) || null,
          rating: parseFloat(get(idx.rating).replace(",", ".")) || null,
          reviews: parseInt(get(idx.reviews)) || null,
          status: STATUS_VALUES.includes(get(idx.status).toUpperCase() as (typeof STATUS_VALUES)[number])
            ? (get(idx.status).toUpperCase() as (typeof STATUS_VALUES)[number])
            : "NOVO",
          tags: get(idx.tags)
            ? get(idx.tags).split(/[;,]/).map((t) => t.trim()).filter(Boolean)
            : [],
          source: get(idx.source) || "csv",
          sourceUrl: get(idx.sourceUrl) || null,
          notes: get(idx.notes) || null,
        };
      })
      .filter((r) => r.name);

    if (records.length === 0) {
      return Response.json({ error: "Nenhuma linha válida no CSV" }, { status: 400 });
    }

    const result = await prisma.lead.createMany({ data: records, skipDuplicates: false });
    return Response.json({ imported: result.count, total: records.length });
  } catch (err) {
    console.error("[api/import]", err);
    return Response.json({ error: "Erro ao importar CSV" }, { status: 500 });
  }
}
