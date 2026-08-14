"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Lock, ArrowLeft, CheckCircle2 } from "lucide-react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível redefinir a senha");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir a senha");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Senha redefinida com sucesso. Faça login com a nova senha.
        </div>
        <Link
          href="/login"
          className="btn-primary inline-flex w-full items-center justify-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Ir para o login
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Link de redefinição inválido: o token não foi informado.
        </div>
        <Link
          href="/forgot-password"
          className="btn-primary inline-flex w-full items-center justify-center gap-2"
        >
          Solicitar novo link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="password">
          Nova senha
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="password"
            className="input pl-9"
            required
            minLength={12}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="mínimo 12 caracteres"
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Use pelo menos 12 caracteres com letras, números e símbolos.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Confirmar nova senha
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="confirm"
            className="input pl-9"
            required
            minLength={12}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="repita a nova senha"
          />
        </div>
      </div>
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Salvando..." : "Redefinir senha"}
      </button>
    </form>
  );
}