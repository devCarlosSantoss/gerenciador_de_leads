import { ImportForm } from "@/components/import-form";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importar CSV</h1>
        <p className="text-sm text-slate-500">
          Importe leads de uma planilha (formato CSV)
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
