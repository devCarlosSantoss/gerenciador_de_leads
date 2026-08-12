import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });

  const headers = [
    "nome",
    "empresa",
    "email",
    "telefone",
    "whatsapp",
    "website",
    "endereco",
    "cidade",
    "uf",
    "categoria",
    "avaliacao",
    "avaliacoes",
    "status",
    "tags",
    "origem",
    "link_origem",
    "notas",
    "criado_em",
  ];

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const rows = leads.map((l) =>
    [
      l.name,
      l.company,
      l.email,
      l.phone,
      l.whatsapp,
      l.website,
      l.address,
      l.city,
      l.state,
      l.category,
      l.rating,
      l.reviews,
      l.status,
      (l.tags ?? []).join(";"),
      l.source,
      l.sourceUrl,
      l.notes,
      l.createdAt.toISOString(),
    ]
      .map(esc)
      .join(",")
  );

  const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads.csv"',
    },
  });
}
