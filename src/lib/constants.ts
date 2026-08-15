export const STATUS = {
  NEW: { label: "Novo", dot: "bg-sky-500", badge: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  ANALYZING: { label: "Analisando", dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  ANALYZED: { label: "Analisado", dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  MESSAGE_GENERATED: { label: "Msg. Gerada", dot: "bg-purple-500", badge: "bg-purple-50 text-purple-700 ring-purple-600/20" },
  MESSAGE_PENDING_APPROVAL: { label: "Pend. Aprovação", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  MESSAGE_APPROVED: { label: "Aprovado", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  CHAT_LINK_OPENED: { label: "Link Aberto", dot: "bg-cyan-500", badge: "bg-cyan-50 text-cyan-700 ring-cyan-600/20" },
  MESSAGE_COPIED: { label: "Copiado", dot: "bg-teal-500", badge: "bg-teal-50 text-teal-700 ring-teal-600/20" },
  SEND_CONFIRMATION_PENDING: { label: "Aguardando Conf.", dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 ring-orange-600/20" },
  CONTACTED_CONFIRMED: { label: "Contatado", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  REPLIED: { label: "Respondeu", dot: "bg-lime-500", badge: "bg-lime-50 text-lime-700 ring-lime-600/20" },
  QUALIFIED: { label: "Qualificado", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  MEETING_BOOKED: { label: "Reunião Agendada", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  PROPOSAL_SENT: { label: "Proposta Enviada", dot: "bg-purple-500", badge: "bg-purple-50 text-purple-700 ring-purple-600/20" },
  CONVERTED: { label: "Convertido", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  NOT_INTERESTED: { label: "Sem Interesse", dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  LOST: { label: "Perdido", dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  OPT_OUT: { label: "Opt-out", dot: "bg-slate-500", badge: "bg-slate-50 text-slate-700 ring-slate-600/20" },
  BLOCKED: { label: "Bloqueado", dot: "bg-red-500", badge: "bg-red-50 text-red-700 ring-red-600/20" },
  ERROR: { label: "Erro", dot: "bg-red-500", badge: "bg-red-50 text-red-700 ring-red-600/20" },
  ARCHIVED: { label: "Arquivado", dot: "bg-slate-500", badge: "bg-slate-50 text-slate-700 ring-slate-600/20" },
} as const;

export type StatusKey = keyof typeof STATUS;

export const STATUS_KEYS = Object.keys(STATUS) as StatusKey[];

export const LEAD_SOURCES = [
  { value: "google_maps", label: "Google Maps" },
  { value: "manual", label: "Manual" },
  { value: "csv", label: "Importação CSV" },
  { value: "site", label: "Site/diretório" },
] as const;

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) return digits.slice(2);
  return digits;
}