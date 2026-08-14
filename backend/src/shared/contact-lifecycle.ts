/**
 * Máquina de estados do ciclo de vida de contato — fonte única de verdade
 * para o frontend e o backend. Mantenha em sincronia com o enum `ContactStatus`
 * definido em `backend/prisma/schema.prisma`.
 *
 * Regra central: ABRIR o link do WhatsApp ou COPIAR a mensagem NUNCA confirma
 * envio. Apenas a confirmação explícita do operador avança para
 * CONTACTED_CONFIRMED.
 */

export const CONTACT_STATUSES = [
  "NEW",
  "ANALYZING",
  "ANALYZED",
  "MESSAGE_GENERATED",
  "PENDING_APPROVAL",
  "APPROVED",
  "CHAT_LINK_OPENED",
  "MESSAGE_COPIED",
  "SEND_CONFIRMATION_PENDING",
  "CONTACTED_CONFIRMED",
  "REPLIED",
  "QUALIFIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
  "CONVERTED",
  "NOT_INTERESTED",
  "LOST",
  "OPT_OUT",
  "BLOCKED",
  "ARCHIVED",
  "ERROR",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_ATTEMPT_ACTIONS = [
  "LINK_OPENED",
  "MESSAGE_COPIED",
  "SEND_CONFIRMED",
  "REPLY_REGISTERED",
  "OPT_OUT_REGISTERED",
] as const;

export type ContactAttemptAction = (typeof CONTACT_ATTEMPT_ACTIONS)[number];

/** Rótulos PT-BR para exibição na interface. */
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  NEW: "Novo",
  ANALYZING: "Em análise",
  ANALYZED: "Analisado",
  MESSAGE_GENERATED: "Mensagem gerada",
  PENDING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovado",
  CHAT_LINK_OPENED: "Link aberto",
  MESSAGE_COPIED: "Mensagem copiada",
  SEND_CONFIRMATION_PENDING: "Aguardando confirmação de envio",
  CONTACTED_CONFIRMED: "Envio confirmado",
  REPLIED: "Respondeu",
  QUALIFIED: "Qualificado",
  MEETING_BOOKED: "Reunião marcada",
  PROPOSAL_SENT: "Proposta enviada",
  CONVERTED: "Convertido",
  NOT_INTERESTED: "Sem interesse",
  LOST: "Perdido",
  OPT_OUT: "Opt-out",
  BLOCKED: "Bloqueado",
  ARCHIVED: "Arquivado",
  ERROR: "Erro",
};

/** Transições válidas entre estados. Inclui somente o que é permitido. */
export const ALLOWED_TRANSITIONS: Record<ContactStatus, readonly ContactStatus[]> = {
  // NEW também aceita avanços diretos para o pipeline de mensagens e para
  // CONTACTED_CONFIRMED: representa o recontato explícito do operador (lead
  // reativado) e a chegada de leads legados. As guardas de mensagem aprovada,
  // suppression e duplicidade continuam valendo.
  NEW: [
    "ANALYZING",
    "MESSAGE_GENERATED",
    "PENDING_APPROVAL",
    "APPROVED",
    "CONTACTED_CONFIRMED",
    "ERROR",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
  ],
  ANALYZING: ["ANALYZED", "ERROR", "OPT_OUT", "BLOCKED", "ARCHIVED"],
  ANALYZED: ["MESSAGE_GENERATED", "PENDING_APPROVAL", "ERROR", "OPT_OUT", "BLOCKED", "ARCHIVED"],
  MESSAGE_GENERATED: ["PENDING_APPROVAL", "APPROVED", "ERROR", "OPT_OUT", "BLOCKED", "ARCHIVED"],
  PENDING_APPROVAL: ["APPROVED", "ERROR", "OPT_OUT", "BLOCKED", "ARCHIVED"],
  APPROVED: [
    "CHAT_LINK_OPENED",
    "MESSAGE_COPIED",
    "SEND_CONFIRMATION_PENDING",
    "CONTACTED_CONFIRMED",
    "ERROR",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
  ],
  CHAT_LINK_OPENED: [
    "MESSAGE_COPIED",
    "SEND_CONFIRMATION_PENDING",
    "CONTACTED_CONFIRMED",
    "ERROR",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
  ],
  MESSAGE_COPIED: [
    "CHAT_LINK_OPENED",
    "SEND_CONFIRMATION_PENDING",
    "CONTACTED_CONFIRMED",
    "ERROR",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
  ],
  SEND_CONFIRMATION_PENDING: ["CONTACTED_CONFIRMED", "ERROR", "OPT_OUT", "BLOCKED", "ARCHIVED"],
  CONTACTED_CONFIRMED: [
    "REPLIED",
    "QUALIFIED",
    "MEETING_BOOKED",
    "PROPOSAL_SENT",
    "NOT_INTERESTED",
    "LOST",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
    "NEW",
  ],
  REPLIED: [
    "QUALIFIED",
    "MEETING_BOOKED",
    "PROPOSAL_SENT",
    "NOT_INTERESTED",
    "LOST",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
    "CONVERTED",
    "NEW",
  ],
  QUALIFIED: [
    "MEETING_BOOKED",
    "PROPOSAL_SENT",
    "REPLIED",
    "NOT_INTERESTED",
    "LOST",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
    "CONVERTED",
    "NEW",
  ],
  MEETING_BOOKED: [
    "PROPOSAL_SENT",
    "QUALIFIED",
    "REPLIED",
    "NOT_INTERESTED",
    "LOST",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
    "CONVERTED",
    "NEW",
  ],
  PROPOSAL_SENT: [
    "CONVERTED",
    "QUALIFIED",
    "MEETING_BOOKED",
    "NOT_INTERESTED",
    "LOST",
    "OPT_OUT",
    "BLOCKED",
    "ARCHIVED",
    "NEW",
  ],
  CONVERTED: ["ARCHIVED", "NEW", "BLOCKED"],
  NOT_INTERESTED: ["LOST", "OPT_OUT", "BLOCKED", "ARCHIVED", "NEW"],
  LOST: ["OPT_OUT", "BLOCKED", "ARCHIVED", "NEW"],
  OPT_OUT: ["BLOCKED", "ARCHIVED"],
  BLOCKED: ["ARCHIVED", "NEW"],
  ARCHIVED: ["NEW", "BLOCKED"],
  ERROR: ["NEW", "ANALYZING", "ARCHIVED", "OPT_OUT", "BLOCKED"],
};

/**
 * Mapeamento para o status legado (`Company.status` / `LeadStatus`) usado pela
 * UI atual e pela compatibilidade. Mantém a listagem existente funcionando
 * enquanto a máquina de estados assume o controle.
 */
export const LEGACY_STATUS_MAP: Record<ContactStatus, string> = {
  NEW: "NOVO",
  ANALYZING: "EM_ANALISE",
  ANALYZED: "AGUARDANDO_REVISAO",
  MESSAGE_GENERATED: "AGUARDANDO_REVISAO",
  PENDING_APPROVAL: "AGUARDANDO_REVISAO",
  APPROVED: "PRONTO_PARA_CONTATO",
  CHAT_LINK_OPENED: "PRONTO_PARA_CONTATO",
  MESSAGE_COPIED: "PRONTO_PARA_CONTATO",
  SEND_CONFIRMATION_PENDING: "PRONTO_PARA_CONTATO",
  CONTACTED_CONFIRMED: "ENVIADO",
  REPLIED: "RESPONDEU",
  QUALIFIED: "INTERESSADO",
  MEETING_BOOKED: "REUNIAO_MARCADA",
  PROPOSAL_SENT: "INTERESSADO",
  CONVERTED: "CONVERTIDO",
  NOT_INTERESTED: "SEM_INTERESSE",
  LOST: "SEM_INTERESSE",
  OPT_OUT: "OPT_OUT",
  BLOCKED: "BLOQUEADO",
  ARCHIVED: "ARQUIVADO",
  ERROR: "ERRO",
};

export function legacyStatusFor(status: ContactStatus): string {
  return LEGACY_STATUS_MAP[status];
}

/** Tipos de evento de atividade registrados em `activity_events`. */
export const ACTIVITY_EVENT_TYPES = {
  CHAT_LINK_OPENED: "chat_link.opened",
  MESSAGE_COPIED: "message.copied",
  MESSAGE_APPROVED: "message.approved",
  SEND_CONFIRMED: "contact.send_confirmed",
  REPLY_REGISTERED: "contact.reply_registered",
  OPT_OUT_REGISTERED: "contact.opt_out_registered",
  STATUS_TRANSITION: "contact.status_transition",
  RECONTACTED: "contact.recontacted",
} as const;

export function isAllowedTransition(from: ContactStatus, to: ContactStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
