"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

export function ImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; total: number } | null>(null);

  async function onImport() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao importar");
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-5 p-6">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-slate-300 hover:border-indigo-300 hover:bg-slate-50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <span className="flex items-center gap-2 text-sm font-medium text-indigo-600">
            <FileText className="h-5 w-5" />
            {file.name}
          </span>
        ) : (
          <>
            <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">
                Clique ou arraste um arquivo CSV aqui
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Deve ter uma coluna nome. Também reconhece: empresa, email,
                telefone, whatsapp, website, endereco, cidade, uf, categoria,
                avaliacao, avaliacoes, status, tags, origem, notas.
              </p>
            </div>
          </>
        )}
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {result.imported} de {result.total} lead(s) importados com sucesso!
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          className="btn-secondary"
          onClick={() => {
            setFile(null);
            setResult(null);
            setError("");
          }}
        >
          Limpar
        </button>
        <button
          className="btn-primary"
          disabled={!file || loading}
          onClick={onImport}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {loading ? "Importando..." : "Importar CSV"}
        </button>
      </div>
    </div>
  );
}
