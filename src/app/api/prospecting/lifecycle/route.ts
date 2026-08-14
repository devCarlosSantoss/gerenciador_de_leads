import { prisma } from "@/lib/db";
import {
  confirmSend,
  copyMessageAction,
  openChatLink,
  registerOptOut,
  registerReply,
  transitionStatus,
  ProspectingApiError,
  type LifecycleTransitionResult,
} from "@/lib/prospecting";
import { CONTACT_STATUSES } from "@shared/contact-lifecycle";

const ACTIONS = ["chat-link-open", "copy", "confirm-send", "reply", "opt-out", "transition"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: unknown;
      companyId?: unknown;
      messageId?: unknown;
      to?: unknown;
      content?: unknown;
      reason?: unknown;
      externalId?: unknown;
    };

    if (typeof body.action !== "string" || !ACTIONS.includes(body.action as Action)) {
      return Response.json({ error: "action inválida" }, { status: 400 });
    }
    if (typeof body.companyId !== "string" || !body.companyId) {
      return Response.json({ error: "companyId é obrigatório" }, { status: 400 });
    }

    const action = body.action as Action;
    const companyId = body.companyId;

    let result: LifecycleTransitionResult;
    switch (action) {
      case "chat-link-open":
      case "copy":
      case "confirm-send": {
        if (typeof body.messageId !== "string" || !body.messageId) {
          return Response.json({ error: "messageId é obrigatório" }, { status: 400 });
        }
        result =
          action === "chat-link-open"
            ? await openChatLink(companyId, body.messageId)
            : action === "copy"
              ? await copyMessageAction(companyId, body.messageId)
              : await confirmSend(companyId, body.messageId);
        break;
      }
      case "reply":
        result = await registerReply(
          companyId,
          typeof body.content === "string" ? body.content : undefined,
        );
        break;
      case "opt-out":
        result = await registerOptOut(
          companyId,
          typeof body.reason === "string" ? body.reason : undefined,
        );
        break;
      case "transition": {
        if (typeof body.to !== "string" || !CONTACT_STATUSES.includes(body.to as never)) {
          return Response.json(
            { error: "to inválido (use um dos estados do ciclo de vida)" },
            { status: 400 },
          );
        }
        result = await transitionStatus(companyId, body.to);
        break;
      }
    }

    // Espelho no sistema legado: só o envio CONFIRMADO marca o lead legado
    // como CONTATADO (abrir link / copiar não alteram o lead legado).
    if (action === "confirm-send" && typeof body.externalId === "string" && body.externalId) {
      await prisma.lead
        .update({ where: { id: body.externalId }, data: { status: "CONTATADO" } })
        .catch((err) => console.error("[api/prospecting/lifecycle] legado", err));
    }

    return Response.json({ ok: true, action, result });
  } catch (err) {
    const status = err instanceof ProspectingApiError ? err.status : 500;
    return Response.json({ error: (err as Error).message }, { status });
  }
}
