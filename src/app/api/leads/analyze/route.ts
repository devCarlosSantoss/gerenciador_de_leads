import { prisma } from "@/lib/db";
import {
  enqueueAnalysis,
  importLeadsToBackend,
  ProspectingApiError,
  resolveByExternalId,
  type BackendImportItem,
} from "@/lib/prospecting";
import type { Lead } from "@prisma/client";

interface AnalyzeResult {
  id: string;
  queued: boolean;
  message: string;
}

const SLEEP_MS = 500;
const MAX_WAIT_MS = 12_000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Converte um Lead legado no contrato de importação do backend. */
function buildImportItem(lead: Lead): BackendImportItem {
  const contacts: BackendImportItem["contacts"] = [];
  if (lead.whatsapp) contacts.push({ type: "WHATSAPP", value: lead.whatsapp });
  else if (lead.phone) contacts.push({ type: "PHONE", value: lead.phone });
  if (lead.email)
    contacts.push({
      type: "EMAIL",
      value: lead.email,
      isPrimary: contacts.length === 0,
    });

  return {
    sourceKey: "frontend-legado",
    sourceUrl: isHttpUrl(lead.sourceUrl),
    externalId: lead.id,
    collectedAt: lead.createdAt.toISOString(),
    company: {
      name: lead.name,
      category: lead.category,
      address: lead.address,
      city: lead.city,
      state: lead.state ? lead.state.slice(0, 2).toUpperCase() : null,
      website: isHttpUrl(lead.website),
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      rating: lead.rating,
      reviewsCount: lead.reviews,
    },
    contacts,
  };
}

/** Migra o lead para o backend (se ainda não existir) e enfileira a análise. */
async function migrateAndAnalyze(leadId: string): Promise<AnalyzeResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return { id: leadId, queued: false, message: "Lead não encontrado." };
  }

  try {
    await importLeadsToBackend([buildImportItem(lead)]);
  } catch (err) {
    const msg =
      err instanceof ProspectingApiError
        ? err.message
        : (err as Error).message;
    return { id: leadId, queued: false, message: `Falha ao migrar: ${msg}` };
  }

  // O backend processa a importação em fila; aguarda a Company aparecer.
  const waited = Date.now();
  while (Date.now() - waited < MAX_WAIT_MS) {
    await delay(SLEEP_MS);
    try {
      const company = await resolveByExternalId(leadId);
      await enqueueAnalysis(company.id);
      return {
        id: leadId,
        queued: true,
        message: `"${company.name}" migrado e em análise — veja o progresso na página do lead.`,
      };
    } catch (err) {
      if (!(err instanceof ProspectingApiError) || err.status !== 404) {
        return {
          id: leadId,
          queued: false,
          message: `Falha ao enfileirar análise: ${(err as Error).message}`,
        };
      }
      // 404: ainda não migrado — continua aguardando.
    }
  }
  return {
    id: leadId,
    queued: false,
    message: `"${lead.name}" migração em andamento. Recarregue a página do lead em alguns segundos.`,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return Response.json({ error: "Nenhum lead selecionado" }, { status: 400 });
    }

    const results: AnalyzeResult[] = [];
    for (const id of body.ids) {
      if (typeof id !== "string" || !id.trim()) continue;
      try {
        const company = await resolveByExternalId(id);
        await enqueueAnalysis(company.id);
        results.push({
          id,
          queued: true,
          message: `"${company.name}" em análise — veja o progresso na página do lead.`,
        });
      } catch (err) {
        if (err instanceof ProspectingApiError && err.status === 404) {
          results.push(await migrateAndAnalyze(id));
        } else {
          results.push({
            id,
            queued: false,
            message: `Falha ao enfileirar análise: ${(err as Error).message}`,
          });
        }
      }
    }

    const failed = results.filter((r) => !r.queued).length;
    return Response.json({
      results,
      enqueued: results.length - failed,
      failed,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Erro ao analisar leads" }, { status: 500 });
  }
}