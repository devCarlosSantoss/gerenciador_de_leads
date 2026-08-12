import { STATUS } from "@/lib/constants";
import type { LeadStatus } from "@prisma/client";

export function StatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUS[status];
  return (
    <span className={`badge ring-1 ring-inset ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
