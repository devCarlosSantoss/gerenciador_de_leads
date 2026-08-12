import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const lead = await prisma.lead.update({ where: { id }, data: body });
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
    await prisma.lead.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Erro ao excluir lead" }, { status: 500 });
  }
}
