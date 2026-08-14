import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="card w-full max-w-sm p-8">
      <h1 className="text-xl font-semibold text-slate-900">Definir nova senha</h1>
      <p className="mt-1 text-sm text-slate-500">
        Escolha uma nova senha para sua conta.
      </p>
      <ResetPasswordForm token={token ?? ""} />
    </div>
  );
}