// Configuração do Prisma 7: driver adapter com PostgreSQL.
// O schema completo vive em prisma/schema.prisma e é a fonte de verdade
// para a nova plataforma (o modelo Lead legado do Next.js não é migrado
// aqui — a migração de dados é feita por job na Fase 1).

import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrate: {
    async: true,
  },
});