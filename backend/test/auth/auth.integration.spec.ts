import { UnauthorizedException, BadRequestException } from "@nestjs/common";
import { describe, expect, it, beforeEach } from "vitest";
import { AuthService } from "../../src/auth/auth.service";
import { PasswordService } from "../../src/auth/password.service";
import { JwtService } from "../../src/auth/jwt.service";
import { RateLimitService } from "../../src/auth/rate-limit.service";
import { MfaService } from "../../src/auth/mfa.service";
import { AuditService } from "../../src/audit/audit.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { AuthController } from "../../src/auth/auth.controller";

// NOTA: os serviços são construídos manualmente (e não via Nest DI/TestingModule)
// porque o transformador esbuild do vitest não emite `emitDecoratorMetadata`,
// necessário para a injeção por reflexão do Nest.

type AnyRecord = Record<string, unknown>;

function isMatchingWhere(record: AnyRecord, where: AnyRecord): boolean {
  for (const [key, value] of Object.entries(where ?? {})) {
    if (key === "revokedAt" && value === null && record.revokedAt) return false;
    if (record[key] !== value) return false;
  }
  return true;
}

class MockPrisma {
  users = new Map<string, AnyRecord>();
  refreshTokens = new Map<string, AnyRecord>();
  resetTokens = new Map<string, AnyRecord>();
  auditLogs: AnyRecord[] = [];
  private seq = 0;

  user = {
    findUnique: async ({ where }: { where: AnyRecord }) => {
      if (where.organizationId_email) {
        const { organizationId, email } = where.organizationId_email;
        return (
          [...this.users.values()].find(
            (u) => u.organizationId === organizationId && u.email === email,
          ) ?? null
        );
      }
      return this.users.get(where.id) ?? null;
    },
    create: async ({ data }: { data: AnyRecord }) => {
      const u = {
        id: `u${++this.seq}`,
        organizationId: "default",
        failedLoginAttempts: 0,
        lockedUntil: null,
        mustChangePassword: false,
        passwordChangedAt: null,
        mfaEnabled: false,
        mfaMethod: "NONE",
        mfaSecretEncrypted: null,
        lastLoginAt: null,
        deletedAt: null,
        ...data,
      };
      this.users.set(u.id, u);
      return u;
    },
    update: async ({ where, data }: { where: AnyRecord; data: AnyRecord }) => {
      const u = this.users.get(where.id)!;
      Object.assign(u, data);
      return u;
    },
  };

  refreshToken = {
    findUnique: async ({ where, include }: { where: AnyRecord; include?: AnyRecord }) => {
      const t =
        [...this.refreshTokens.values()].find((x) => x.tokenHash === where.tokenHash) ??
        null;
      if (t && include?.user) t.user = this.users.get(t.userId);
      return t;
    },
    create: async ({ data }: { data: AnyRecord }) => {
      const t = {
        id: `rt${++this.seq}`,
        revokedAt: null,
        replacedBy: null,
        ...data,
      };
      this.refreshTokens.set(t.id, t);
      return t;
    },
    update: async ({ where, data }: { where: AnyRecord; data: AnyRecord }) => {
      const t = this.refreshTokens.get(where.id)!;
      Object.assign(t, data);
      return t;
    },
    updateMany: async ({ where, data }: { where: AnyRecord; data: AnyRecord }) => {
      let count = 0;
      for (const t of this.refreshTokens.values()) {
        if (!isMatchingWhere(t, where)) continue;
        Object.assign(t, data);
        count++;
      }
      return { count };
    },
  };

  passwordResetToken = {
    deleteMany: async ({ where }: { where: AnyRecord }) => {
      for (const t of [...this.resetTokens.values()]) {
        if (where.userId && t.userId === where.userId) this.resetTokens.delete(t.id);
      }
      return { count: 0 };
    },
    create: async ({ data }: { data: AnyRecord }) => {
      const t = { id: `prt${++this.seq}`, ...data };
      this.resetTokens.set(t.id, t);
      return t;
    },
    findUnique: async ({ where, include }: { where: AnyRecord; include?: AnyRecord }) => {
      const t =
        [...this.resetTokens.values()].find((x) => x.tokenHash === where.tokenHash) ?? null;
      if (t && include?.user) t.user = this.users.get(t.userId);
      return t;
    },
    update: async ({ where, data }: { where: AnyRecord; data: AnyRecord }) => {
      const t = this.resetTokens.get(where.id)!;
      Object.assign(t, data);
      return t;
    },
  };

  auditLog = {
    create: async ({ data }: { data: AnyRecord }) => {
      this.auditLogs.push(data);
      return { id: `al${++this.seq}`, ...data };
    },
  };

  $transaction = async (ops: Promise<unknown>[]) => {
    for (const op of ops) await op;
  };
}

function build() {
  const prisma = new MockPrisma();
  const passwords = new PasswordService();
  const service = new AuthService(
    prisma as unknown as PrismaService,
    new AuditService(prisma as unknown as PrismaService),
    passwords,
    new JwtService(),
    new RateLimitService(),
    new MfaService(),
  );
  const controller = new AuthController(service);
  return { prisma, service, controller, passwords };
}

describe("AuthService (integração com Prisma mockado)", () => {
  const EMAIL = "admin@teste.com";
  const PASSWORD = "Senha-*Forte-2026!";
  const ctx = { ip: "127.0.0.1", userAgent: "vitest" };

  let prisma: MockPrisma;
  let service: AuthService;
  let controller: AuthController;

  beforeEach(async () => {
    ({ prisma, service, controller } = build());
    // admin inicial (como o script db:create-admin faria)
    await prisma.user.create({
      data: {
        organizationId: "default",
        email: EMAIL,
        name: "Admin",
        role: "ADMIN",
        passwordHash: await new PasswordService().hash(PASSWORD),
        active: true,
      },
    });
  });

  function auditActions(): string[] {
    return prisma.auditLogs.map((a) => a.action);
  }

  it("login com credenciais corretas retorna tokens e registra auditoria", async () => {
    const res = await service.login(EMAIL, PASSWORD, ctx);
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(res.user.email).toBe(EMAIL);
    expect(res.user.requiresMfa).toBe(false);
    expect(auditActions()).toContain("auth.login.success");
  });

  it("login com senha errada retorna 401 genérico e registra falha", async () => {
    const err = await service.login(EMAIL, "errada", ctx).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toContain("Credenciais inválidas");
    expect(auditActions()).toContain("auth.login.failed");
  });

  it("login com e-mail inexistente retorna a mesma mensagem genérica", async () => {
    const err = await service.login("ghost@teste.com", "qualquer", ctx).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe(
      (await service.login(EMAIL, "errada", ctx).catch((e) => e)).message,
    );
  });

  it("bloqueia temporariamente após 5 tentativas inválidas", async () => {
    for (let i = 0; i < 5; i++) {
      await service.login(EMAIL, "errada", ctx).catch(() => undefined);
    }
    // login correto agora deve falhar (conta bloqueada)
    await expect(service.login(EMAIL, PASSWORD, ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auditActions()).toContain("auth.login.locked");
  });

  it("refresh rotaciona o token e revoga o anterior", async () => {
    const { refreshToken: rt1 } = await service.login(EMAIL, PASSWORD, ctx);
    const rotated = await service.refresh(rt1, ctx);
    expect(rotated.refreshToken).not.toBe(rt1);
    // reuso do antigo revoga a família
    await expect(service.refresh(rt1, ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditActions()).toContain("auth.refresh.rotated");
    expect(auditActions()).toContain("auth.refresh.revoked_family");
    // o novo também fica inválido (família revogada)
    await expect(service.refresh(rotated.refreshToken, ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("logout revoga o refresh token", async () => {
    const { refreshToken } = await service.login(EMAIL, PASSWORD, ctx);
    await service.logout(refreshToken, ctx);
    await expect(service.refresh(refreshToken, ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auditActions()).toContain("auth.logout");
  });

  it("recuperação de senha: token de uso único e expiração", async () => {
    const res = await service.requestPasswordReset(EMAIL, ctx);
    expect(res.resetToken).toBeTruthy();

    await service.resetPassword(res.resetToken!, "Nova-*Senha-2026!", ctx);
    expect(auditActions()).toContain("auth.password.reset_completed");

    // senha antiga não funciona mais
    await expect(service.login(EMAIL, PASSWORD, ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // nova senha funciona
    const login = await service.login(EMAIL, "Nova-*Senha-2026!", ctx);
    expect(login.accessToken).toBeTruthy();
    // token não pode ser reutilizado
    await expect(
      service.resetPassword(res.resetToken!, "Outra-*Senha-2026!", ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recuperação não revela se o e-mail existe", async () => {
    const res = await service.requestPasswordReset("naoexiste@teste.com", ctx);
    expect(res.resetToken).toBeUndefined();
    expect(res.message).toContain("Se o e-mail estiver cadastrado");
  });

  it("troca de senha exige senha atual correta e senha forte", async () => {
    const { accessToken, user } = await service.login(EMAIL, PASSWORD, ctx);
    // senha atual errada
    await expect(
      service.changePassword(user.id, "errada", "Nova-*Senha-2026!", ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // senha nova fraca
    await expect(
      service.changePassword(user.id, PASSWORD, "abc", ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
    // ok
    await service.changePassword(user.id, PASSWORD, "Nova-*Senha-2026!", ctx);
    expect(auditActions()).toContain("auth.password.changed");
    await expect(service.login(EMAIL, PASSWORD, ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const me = await service.me(user.id);
    void accessToken;
    expect(me.email).toBe(EMAIL);
  });

  it("controller valida payloads com zod", async () => {
    const req = {
      headers: {},
      ip: "127.0.0.1",
    } as unknown as import("express").Request;
    await expect(
      controller.login({ email: "invalido", password: "x" }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("guard exige Bearer token válido", async () => {
    const { JwtAuthGuard } = await import("../../src/auth/jwt-auth.guard");
    const { Reflector } = await import("@nestjs/core");
    const guard = new JwtAuthGuard(new JwtService(), new Reflector());

    const makeCtx = (authorization?: string) =>
      ({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization } }),
        }),
      }) as unknown as import("@nestjs/common").ExecutionContext;

    // sem header → 401
    await expect(guard.canActivate(makeCtx())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Bearer vazio → 401
    await expect(guard.canActivate(makeCtx("Bearer "))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // token válido → autorizado
    const token = await new JwtService().signAccessToken({
      sub: "u1",
      email: "a@b.com",
      name: "Ana",
      role: "ADMIN",
      orgId: "default",
    });
    await expect(guard.canActivate(makeCtx(`Bearer ${token}`))).resolves.toBe(true);
  });
});