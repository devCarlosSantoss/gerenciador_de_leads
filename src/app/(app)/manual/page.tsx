import { ManualSendList, type ManualSendItem } from "@/components/manual-send";
import { ManualReviewList, type PendingItem } from "@/components/manual-review";
import {
  listLeadsReady,
  listMessages,
  getChatLink,
  ProspectingApiError,
} from "@/lib/prospecting";

export const dynamic = "force-dynamic";

export default async function ManualSendPage() {
  let ready: ManualSendItem[] = [];
  let pending: PendingItem[] = [];
  let error: string | null = null;

  try {
    const [pendingLeads, readyLeads] = await Promise.all([
      listLeadsReady("AGUARDANDO_REVISAO"),
      listLeadsReady("PRONTO_PARA_CONTATO"),
    ]);

    const [pendingItems, readyItems] = await Promise.all([
      Promise.all(
        pendingLeads.data.map(async (lead) => {
          const messages = await listMessages(lead.id);
          const drafts = messages.filter((m) => m.status === "DRAFT");
          if (drafts.length === 0) return null;
          return {
            lead: {
              id: lead.id,
              name: lead.name,
              category: lead.category,
              city: lead.city,
              state: lead.state,
            },
            messages: drafts.map((m) => ({
              id: m.id,
              content: m.content,
              variant: m.variant,
            })),
          };
        }),
      ),
      Promise.all(
        readyLeads.data.map(async (lead) => {
          const messages = await listMessages(lead.id);
          const approved = messages.filter((m) => m.status === "APPROVED");
          const withLinks = await Promise.all(
            approved.map(async (m) => {
              try {
                return { ...m, link: await getChatLink(lead.id, m.id) };
              } catch {
                return { ...m, link: null };
              }
            }),
          );
          return {
            lead: {
              id: lead.id,
              externalId: lead.externalId,
              name: lead.name,
              category: lead.category,
              city: lead.city,
              state: lead.state,
              contactStatus: lead.contactStatus,
            },
            messages: withLinks,
          };
        }),
      ),
    ]);

    pending = pendingItems.filter(
      (it): it is PendingItem => it !== null,
    );
    ready = readyItems.filter((it) => it.messages.length > 0);
  } catch (err) {
    error =
      err instanceof ProspectingApiError
        ? err.message
        : "Não foi possível carregar os leads prontos para envio.";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Envio manual</h1>
        <p className="text-sm text-slate-500">
          Rascunhos gerados pela IA aguardam sua aprovação; depois é só abrir o
          WhatsApp e enviar.
        </p>
      </div>

      {error ? (
        <div className="card border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Aguardando aprovação
              </h2>
              <p className="text-sm text-slate-500">
                Revise e aprove o melhor rascunho. O lead só é liberado para
                contato depois da aprovação.
              </p>
            </div>
            <ManualReviewList items={pending} />
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Prontos para enviar
              </h2>
              <p className="text-sm text-slate-500">
                Mensagem aprovada, com link pronto para o WhatsApp.
              </p>
            </div>
            <ManualSendList items={ready} />
          </section>
        </>
      )}
    </div>
  );
}
