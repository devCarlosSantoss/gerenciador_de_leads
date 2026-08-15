import type { LeadListItem } from "@/types/prisma";

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

function getPrimaryContact(contacts: { type: string; value: string; isPrimary?: boolean }[], type: string): string {
  const c = contacts.find((c) => c.type === type);
  return c?.value ?? "";
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

  const data = (await res.json()) as { data: LeadListItem[] };
  const leads = data.data;

  const headersCSV = [
    "nome",
    "categoria",
    "telefone",
    "whatsapp",
    "email",
    "website",
    "endereco",
    "cidade",
    "uf",
    "status",
    "score",
    "score_tier",
    "origem",
    "link_origem",
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
      l.category,
      getPrimaryContact(l.contacts, "PHONE"),
      getPrimaryContact(l.contacts, "WHATSAPP"),
      getPrimaryContact(l.contacts, "EMAIL"),
      l.websites?.[0]?.url ?? "",
      l.address,
      l.city,
      l.state,
      l.status,
      l.score ?? "",
      l.scoreTier ?? "",
      l.dataOrigin,
      l.sourceUrl,
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