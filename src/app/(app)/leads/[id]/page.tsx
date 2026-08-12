import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { LeadDetail } from "@/components/lead-detail";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) notFound();

  return <LeadDetail lead={lead} />;
}
