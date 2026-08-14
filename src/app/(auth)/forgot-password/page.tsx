import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="card w-full max-w-sm p-8">
      <h1 className="text-xl font-semibold text-slate-900">Recuperar senha</h1>
      <p className="mt-1 text-sm text-slate-500">
        Informe seu e-mail cadastrado para redefinir a senha.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}