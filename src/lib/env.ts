import { z } from "zod";

/**
 * Validação das variáveis de ambiente do frontend no início da aplicação
 * (executada em `src/instrumentation.ts`).
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  // Segredo compartilhado com o backend (assina/valida access tokens JWT).
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET deve ter no mínimo 32 caracteres (openssl rand -hex 32)"),
  PROSPECTING_API_URL: z
    .string()
    .url("PROSPECTING_API_URL deve ser uma URL válida")
    .optional(),
  PROSPECTING_ORG_ID: z.string().min(1).optional(),
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