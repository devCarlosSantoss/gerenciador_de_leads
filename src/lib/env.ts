import { z } from "zod";

/**
 * Validação das variáveis de ambiente do frontend no início da aplicação
 * (executada em `src/instrumentation.ts`).
 */
const envSchema = z.object({
  // Segredo compartilhado com o backend (assina/valida access tokens JWT).
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET deve ter no mínimo 32 caracteres (openssl rand -hex 32)"),
  NEXT_PUBLIC_API_URL: z
    .string()
    .url("NEXT_PUBLIC_API_URL deve ser uma URL válida")
    .optional(),
});

export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
}