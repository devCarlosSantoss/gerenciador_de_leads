export const dynamic = "force-dynamic";

async function getAuthHeaders(): Promise<HeadersInit> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("leads_session")?.value;
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function GET() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  if (!API_URL) {
    return new Response("API URL não configurada", { status: 500 });
  }

  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/leads?pageSize=10000`, {
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    return new Response("Erro ao buscar leads", { status: res.status });
  }

  const data = (await res.json()) as { data: Array<Record<string, unknown>> };
  const leads = data.data;

  const headersCSV = [
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
      l.reviewsCount,
      l.status,
      (l.tags ?? []).join(";"),
      l.source,
      l.sourceUrl,
      l.notes,
      l.createdAt,
    ]
      .map(esc)
      .join(",")
  );

  const csv = "\uFEFF" + [headersCSV.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads.csv"',
    },
  });
}