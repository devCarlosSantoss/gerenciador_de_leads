/**
 * Bootstrap do usuário admin pessoal (single-user).
 *
 * Uso:
 *   PERSONAL_ADMIN_PASSWORD='senha-forte-*' npm run db:bootstrap
 *
 * A senha é usada APENAS na primeira execução para criar o usuário.
 * Após o setup, REMOVA PERSONAL_ADMIN_PASSWORD do ambiente.
 * O usuário será forçado a trocar a senha no primeiro login.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config/env";
import { PasswordService } from "../auth/password.service";

const passwords = new PasswordService();

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });

  const password = process.env.PERSONAL_ADMIN_PASSWORD;
  if (!password) {
    console.error("✖ PERSONAL_ADMIN_PASSWORD não definido. Defina no .env para bootstrap inicial.");
    process.exit(1);
  }

  const strength = passwords.isStrong(password);
  if (!strength.ok) {
    console.error(`✖ Senha inicial fraca: ${strength.message}`);
    process.exit(1);
  }

  const existing = await prisma.adminUser.findFirst();
  if (existing) {
    console.log("✔ Usuário admin já existe, pulando bootstrap.");
    console.log(`   Email: ${existing.email}`);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await passwords.hash(password);

  const user = await prisma.adminUser.create({
    data: {
      email: "carlos@auroracode.tech",
      name: "Carlos Vinicius",
      passwordHash,
      mustChangePassword: true,
      active: true,
    },
  });

  console.log(`✔ Usuário admin criado: ${user.email}`);
  console.log("⚠  IMPORTANTE: Remova PERSONAL_ADMIN_PASSWORD do .env após o bootstrap!");
  console.log("   O usuário deve trocar a senha no primeiro login.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("✖ Falha no bootstrap:", (err as Error).message);
  process.exit(1);
});