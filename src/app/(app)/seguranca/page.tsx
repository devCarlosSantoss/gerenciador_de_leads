import { ChangePasswordForm } from "./change-password-form";

export default function SegurancaPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold text-slate-900">Trocar senha</h1>
      <p className="mt-1 text-sm text-slate-500">
        Após alterar, todos os dispositivos serão desconectados e será preciso
        entrar novamente.
      </p>
      <div className="card mt-6 p-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}