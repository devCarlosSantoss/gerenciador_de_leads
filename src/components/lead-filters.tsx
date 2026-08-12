"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useCallback, useState } from "react";

export function LeadFilters({
  initialQ,
  initialStatus,
  statusOptions,
}: {
  initialQ: string;
  initialStatus?: string;
  statusOptions: Record<string, { label: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus ?? "");

  const apply = useCallback(
    (nextQ: string, nextStatus: string) => {
      const params = new URLSearchParams();
      if (nextQ) params.set("q", nextQ);
      if (nextStatus) params.set("status", nextStatus);
      router.push(`/leads?${params.toString()}`);
    },
    [router]
  );

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          apply(q, status);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9 pr-8"
          placeholder="Buscar por nome, empresa, e-mail, telefone, cidade..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={() => {
              setQ("");
              apply("", status);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>
      <select
        className="input sm:w-48"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          apply(q, e.target.value);
        }}
      >
        <option value="">Todos os status</option>
        {Object.entries(statusOptions).map(([key, s]) => (
          <option key={key} value={key}>
            {s.label}
          </option>
        ))}
      </select>
      {searchParams.toString() !== "" && (
        <button
          className="btn-ghost shrink-0"
          onClick={() => {
            setQ("");
            setStatus("");
            router.push("/leads");
          }}
        >
          Limpar
        </button>
      )}
    </div>
  );
}
