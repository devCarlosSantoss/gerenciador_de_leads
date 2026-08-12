import { LeadForm } from "@/components/lead-form";

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Novo lead</h1>
        <p className="text-sm text-slate-500">
          Cadastre um lead manualmente
        </p>
      </div>
      <LeadForm />
    </div>
  );
}
