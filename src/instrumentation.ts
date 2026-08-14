/**
 * Validação das variáveis de ambiente no início do servidor (Node runtime).
 * Ignorada durante `next build` para não quebrar o Dockerfile (que usa uma
 * DATABASE_URL placeholder apenas para o prisma generate).
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}