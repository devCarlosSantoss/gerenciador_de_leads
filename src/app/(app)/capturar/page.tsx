import { CaptureForm } from "@/components/capture-form";

export default function CapturePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Capturar leads na internet
        </h1>
        <p className="text-sm text-slate-500">
          Busque negócios no Google Maps e salve direto na sua base
        </p>
      </div>
      <CaptureForm />
    </div>
  );
}
