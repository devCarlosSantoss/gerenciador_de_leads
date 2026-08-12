import { prisma } from "@/lib/db";
import type { LeadStatus } from "@prisma/client";

const STATUSES: LeadStatus[] = [
  "NOVO",
  "CONTATADO",
  "QUALIFICADO",
  "PERDIDO",
  "CONVERTIDO",
];

function sanitize(body: Record<string, unknown>) {
  const s = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    name: s(body.name),
    company: s(body.company),
    email: s(body.email),
    phone: s(body.phone),
    whatsapp: s(body.whatsapp),
    website: s(body.website),
    address: s(body.address),
    city: s(body.city),
    state: s(body.state),
    category: s(body.category),
    notes: s(body.notes),
    source: s(body.source),
    sourceUrl: s(body.sourceUrl),
    rating:
      typeof body.rating === "number" && Number.isFinite(body.rating)
        ? Math.max(0, Math.min(5, body.rating))
        : null,
    reviews:
      typeof body.reviews === "number" && Number.isFinite(body.reviews)
        ? Math.max(0, Math.floor(body.reviews))
        : null,
    status: (STATUSES as string[]).includes(String(body.status))
      ? (body.status as LeadStatus)
      : "NOVO",
    tags: Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : [],
  };
}

export async function POST(request: Request) {
  try {
    const body = sanitize(await request.json());
    if (!body.name) {
      return Response.json({ error: "O nome é obrigatório" }, { status: 400 });
    }
    const lead = await prisma.lead.create({
      data: {
        name: body.name!,
        company: body.company,
        email: body.email,
        phone: body.phone,
        whatsapp: body.whatsapp,
        website: body.website,
        address: body.address,
        city: body.city,
        state: body.state,
        category: body.category,
        notes: body.notes,
        source: body.source ?? "manual",
        sourceUrl: body.sourceUrl,
        rating: body.rating,
        reviews: body.reviews,
        status: body.status,
        tags: body.tags,
      },
    });
    return Response.json(lead, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Erro ao criar lead" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: "Nenhum lead selecionado" }, { status: 400 });
    }
    const result = await prisma.lead.deleteMany({ where: { id: { in: ids } } });
    return Response.json({ deleted: result.count });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Erro ao excluir leads" }, { status: 500 });
  }
}
