async function getAuthHeaders(): Promise<HeadersInit> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("leads_session")?.value;
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();

    const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
    if (!API_URL) {
      return Response.json({ error: "API URL não configurada" }, { status: 500 });
    }

    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/leads/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Erro ao atualizar lead" }));
      return Response.json(error, { status: res.status });
    }

    const lead = await res.json();
    return Response.json(lead);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Erro ao atualizar lead" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
    if (!API_URL) {
      return Response.json({ error: "API URL não configurada" }, { status: 500 });
    }

    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/leads/${id}`, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Erro ao excluir lead" }));
      return Response.json(error, { status: res.status });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Erro ao excluir lead" }, { status: 500 });
  }
}