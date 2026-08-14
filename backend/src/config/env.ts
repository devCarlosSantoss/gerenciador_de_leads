import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().optional().default("gemini-1.5-flash"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().optional().default("llama-3.3-70b-versatile"),
  GROQ_BASE_URL: z.string().optional().default("https://api.groq.com/openai/v1"),
  SENDER_NAME: z.string().optional().default("Carlos Vinicius"),
  PAGESPEED_API_KEY: z.string().optional().default(""),
  PORT: z.coerce.number().optional().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ── Autenticação ─────────────────────────────────────────────
  // Segredo compartilhado com o frontend (usado para assinar/validar
  // os access tokens JWT). Obrigatório e com no mínimo 32 caracteres.
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET deve ter no mínimo 32 caracteres (gere com `openssl rand -hex 32`)"),
  JWT_ACCESS_TTL: z.string().optional().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().optional().default(7),
  DEFAULT_ORG_ID: z.string().min(1).optional().default("default"),
  // Admin inicial (usado APENAS pelo script `db:create-admin`).
  // Não use em produção sem remover as variáveis depois da criação.
  ADMIN_INITIAL_EMAIL: z.string().email().optional(),
  ADMIN_INITIAL_PASSWORD: z.string().optional(),
  ADMIN_INITIAL_NAME: z.string().optional().default("Administrador"),
  // Policy de senha forte
  PASSWORD_MIN_LENGTH: z.coerce.number().optional().default(12),
  PASSWORD_MAX_LENGTH: z.coerce.number().optional().default(128),
  // Lockout por tentativas consecutivas inválidas
  LOGIN_MAX_ATTEMPTS: z.coerce.number().optional().default(5),
  LOGIN_LOCK_MS: z.coerce.number().optional().default(15 * 60 * 1000),
  // Rate limiting de login (Redis, por IP)
  LOGIN_RATE_LIMIT: z.coerce.number().optional().default(10),
  LOGIN_RATE_WINDOW_MS: z.coerce.number().optional().default(60 * 1000),
  // Token de recuperação de senha
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().optional().default(30),
  RESET_PASSWORD_BASE_URL: z.string().url().optional(),
  // CORS explícito (lista separada por vírgula)
  CORS_ORIGIN: z.string().optional().default("http://localhost:3000"),
});

export type AppConfig = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

export const config: AppConfig = parsed.success
  ? parsed.data
  : (() => {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Configuração de ambiente inválida:\n${issues}`);
    })();

export const isProduction = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";