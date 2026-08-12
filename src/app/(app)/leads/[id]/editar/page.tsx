import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { LeadForm } from "@/components/lead-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Editar lead</h1>
          <p className="text-sm text-slate-500">{lead.name}</p>
        </div>
        <Link href={`/leads/${lead.id}`} className="btn-ghost">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </div>
      <LeadForm lead={lead} />
    </div>
  );
}
