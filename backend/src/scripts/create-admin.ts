/**
 * Cria (ou atualiza) o usuário administrador inicial.
 *
 * Uso seguro (recomendado):
 *   ADMIN_INITIAL_EMAIL=admin@exemplo.com ADMIN_INITIAL_PASSWORD='senha-forte-*' \
 *     npm run db:create-admin
 *
 * A senha NUNCA fica fixa no código e não é logada. Se as variáveis não
 * estiverem definidas, o script pergunta interativamente (senha oculta).
 *
 * Importante: remova ADMIN_INITIAL_* do ambiente depois da criação.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config } from "../config/env";
import { PasswordService } from "../auth/password.service";

const passwords = new PasswordService();

async function promptText(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(question)).trim();
  rl.close();
  return answer;
}

function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const prevRaw = stdin.isRaw ?? false;
    stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf8");
      if (char === "\r" || char === "\n") {
        stdin.removeListener("data", onData);
        stdin.setRawMode(prevRaw);
        stdin.pause();
        process.stdout.write("\n");
        resolve(value);
      } else if (char === "\u0003") {
        process.exit(130);
      } else if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(config.DATABASE_URL) });

  const email = (process.env.ADMIN_INITIAL_EMAIL ?? (await promptText("E-mail do administrador: ")))
    .trim()
    .toLowerCase();
  const name = (process.env.ADMIN_INITIAL_NAME ?? "Administrador").trim();
  const password =
    process.env.ADMIN_INITIAL_PASSWORD ?? (await promptSecret("Senha (não será exibida): "));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("✖ E-mail inválido.");
    process.exit(1);
  }
  const strength = passwords.isStrong(password);
  if (!strength.ok) {
    console.error(`✖ ${strength.message}`);
    process.exit(1);
  }

  const passwordHash = await passwords.hash(password);
  const org = config.DEFAULT_ORG_ID;

  const existing = await prisma.user.findUnique({
    where: { organizationId_email: { organizationId: org, email } },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        passwordHash,
        role: "ADMIN",
        active: true,
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        deletedAt: null,
      },
    });
    console.log(`✔ Administrador atualizado: ${email} (organização "${org}").`);
  } else {
    await prisma.user.create({
      data: {
        organizationId: org,
        email,
        name,
        role: "ADMIN",
        passwordHash,
        active: true,
      },
    });
    console.log(`✔ Administrador criado: ${email} (organização "${org}").`);
  }

  console.log("⚠  Remova ADMIN_INITIAL_PASSWORD do ambiente após a criação.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("✖ Falha ao criar administrador:", err);
  process.exit(1);
});