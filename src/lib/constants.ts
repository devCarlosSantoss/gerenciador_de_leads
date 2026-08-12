export const STATUS = {
  NOVO: { label: "Novo", dot: "bg-sky-500", badge: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  CONTATADO: { label: "Contatado", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  QUALIFICADO: { label: "Qualificado", dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  PERDIDO: { label: "Perdido", dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  CONVERTIDO: { label: "Convertido", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
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
