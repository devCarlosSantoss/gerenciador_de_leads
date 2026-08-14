import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="card w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
          <SparklesIcon />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Leads Pro</h1>
        <p className="text-sm text-slate-500">
          Acesse o gerenciador de leads
        </p>
      </div>
      <LoginForm />
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </svg>
  );
}