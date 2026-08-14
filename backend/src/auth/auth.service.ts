import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "./password.service";
import { JwtService, type AccessTokenPayload } from "./jwt.service";
import { RateLimitService } from "./rate-limit.service";
import { MfaService } from "./mfa.service";
import { config } from "../config/env";

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    mustChangePassword: boolean;
    requiresMfa: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly rateLimit: RateLimitService,
    private readonly mfa: MfaService,
  ) {}

  private org() {
    return config.DEFAULT_ORG_ID;
  }

  // ────────────────────────── Login ──────────────────────────

  async login(
    emailInput: string,
    password: string,
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const email = normalizeEmail(emailInput);
    const ipKey = ctx.ip ?? "unknown";

    const allowed = await this.rateLimit.check(
      `auth:login:${ipKey}`,
      config.LOGIN_RATE_LIMIT,
      config.LOGIN_RATE_WINDOW_MS,
    );
    if (!allowed) {
      throw new UnauthorizedException("Credenciais inválidas ou conta bloqueada.");
    }

    const user = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: this.org(), email } },
    });

    if (!user || !user.active || !user.passwordHash) {
      await this.passwords.timingSafeDummyVerify();
      await this.audit.record({
        organizationId: this.org(),
        actorType: "user",
        action: "auth.login.failed",
        entityType: "users",
        after: { email, reason: "user_not_found" },
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException("Credenciais inválidas ou conta bloqueada.");
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.audit.record({
        organizationId: this.org(),
        actorId: user.id,
        actorType: "user",
        action: "auth.login.locked",
        entityType: "users",
        entityId: user.id,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException("Credenciais inválidas ou conta bloqueada.");
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, password);
    if (!passwordOk) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= config.LOGIN_MAX_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + config.LOGIN_LOCK_MS)
            : null,
        },
      });
      await this.audit.record({
        organizationId: this.org(),
        actorId: user.id,
        actorType: "user",
        action: shouldLock ? "auth.login.locked" : "auth.login.failed",
        entityType: "users",
        entityId: user.id,
        after: { email, attempts },
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException("Credenciais inválidas ou conta bloqueada.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user, ctx);
    await this.audit.record({
      organizationId: this.org(),
      actorId: user.id,
      actorType: "user",
      action: "auth.login.success",
      entityType: "users",
      entityId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.buildResult(user, tokens);
  }

  // ────────────────────────── Refresh ──────────────────────────

  async refresh(refreshToken: string, ctx: RequestContext): Promise<AuthResult> {
    const tokenHash = this.passwords.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || !stored.user.active || !stored.user.passwordHash) {
      throw new UnauthorizedException("Sessão expirada. Faça login novamente.");
    }

    if (stored.revokedAt) {
      // Reuso de token revogado = possível roubo → revoga toda a família.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        organizationId: this.org(),
        actorId: stored.userId,
        actorType: "user",
        action: "auth.refresh.revoked_family",
        entityType: "refresh_tokens",
        after: { familyId: stored.familyId },
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException("Sessão expirada. Faça login novamente.");
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Sessão expirada. Faça login novamente.");
    }

    const familyId = stored.familyId;
    const oldId = stored.id;

    // Rotação: novo refresh token na mesma família; revoga o atual.
    const { accessToken, refreshToken: newRefresh, refreshTokenId } =
      await this.createRefreshToken(stored.user, familyId, ctx);
    await this.prisma.refreshToken.update({
      where: { id: oldId },
      data: { revokedAt: new Date(), replacedBy: refreshTokenId },
    });

    await this.audit.record({
      organizationId: this.org(),
      actorId: stored.userId,
      actorType: "user",
      action: "auth.refresh.rotated",
      entityType: "refresh_tokens",
      entityId: oldId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.buildResult(stored.user, {
      accessToken,
      refreshToken: newRefresh,
    });
  }

  // ────────────────────────── Logout ──────────────────────────

  async logout(refreshToken: string, ctx: RequestContext): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = this.passwords.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revokedAt) return;

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      organizationId: this.org(),
      actorId: stored.userId,
      actorType: "user",
      action: "auth.logout",
      entityType: "refresh_tokens",
      entityId: stored.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  // ──────────────── Recuperação de senha (uso único) ────────────────

  async requestPasswordReset(emailInput: string, ctx: RequestContext) {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: this.org(), email } },
    });

    // Resposta sempre genérica: não revela se o e-mail existe.
    if (!user || !user.active) {
      return { message: "Se o e-mail estiver cadastrado, você receberá um link de redefinição." };
    }

    const rawToken = this.passwords.generateToken(32);
    const ttlMs = config.RESET_TOKEN_TTL_MINUTES * 60 * 1000;

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          organizationId: this.org(),
          tokenHash: this.passwords.hashToken(rawToken),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);

    await this.audit.record({
      organizationId: this.org(),
      actorId: user.id,
      actorType: "user",
      action: "auth.password.reset_requested",
      entityType: "users",
      entityId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    // Sem infraestrutura de e-mail: em dev/test o token é devolvido para
    // permitir testar o fluxo. Em produção retorne apenas o texto genérico.
    if (config.NODE_ENV === "production") {
      return { message: "Se o e-mail estiver cadastrado, você receberá um link de redefinição." };
    }

    return {
      message: "Se o e-mail estiver cadastrado, você receberá um link de redefinição.",
      resetToken: rawToken,
      expiresAt: new Date(Date.now() + ttlMs),
    };
  }

  async resetPassword(token: string, newPassword: string, ctx: RequestContext): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.passwords.hashToken(token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        "Token de recuperação inválido ou expirado. Solicite um novo.",
      );
    }

    const strength = this.passwords.isStrong(newPassword);
    if (!strength.ok) throw new BadRequestException(strength.message);

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      organizationId: this.org(),
      actorId: record.userId,
      actorType: "user",
      action: "auth.password.reset_completed",
      entityType: "users",
      entityId: record.userId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  // ──────────────────────── Troca de senha ────────────────────────

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Usuário não encontrado.");
    }

    const currentOk = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!currentOk) {
      await this.audit.record({
        organizationId: this.org(),
        actorId: user.id,
        actorType: "user",
        action: "auth.password.change_failed",
        entityType: "users",
        entityId: user.id,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException("Senha atual incorreta.");
    }

    const strength = this.passwords.isStrong(newPassword);
    if (!strength.ok) throw new BadRequestException(strength.message);

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      // Revoga todas as sessões para forçar novo login com a nova senha.
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      organizationId: this.org(),
      actorId: user.id,
      actorType: "user",
      action: "auth.password.changed",
      entityType: "users",
      entityId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  // ───────────────────────────── Me ─────────────────────────────

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Usuário não encontrado.");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      mustChangePassword: user.mustChangePassword,
      mfaEnabled: user.mfaEnabled,
    };
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async issueTokens(
    user: User,
    ctx: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string; refreshTokenId: string }> {
    const familyId = this.passwords.generateToken(16);
    return this.createRefreshToken(user, familyId, ctx);
  }

  private async createRefreshToken(
    user: User,
    familyId: string,
    ctx: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string; refreshTokenId: string }> {
    const refreshToken = this.passwords.generateToken(32);
    const refreshExpiry = Date.now() + config.JWT_REFRESH_TTL_DAYS * 86400 * 1000;

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.organizationId,
      type: "access",
    };
    const accessToken = await this.jwt.signAccessToken(accessPayload);

    const created = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash: this.passwords.hashToken(refreshToken),
        familyId,
        expiresAt: new Date(refreshExpiry),
        userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 300) : null,
        ipAddress: ctx.ip ? ctx.ip.slice(0, 64) : null,
      },
    });

    return { accessToken, refreshToken, refreshTokenId: created.id };
  }

  private buildResult(
    user: User,
    tokens: { accessToken: string; refreshToken: string },
  ): AuthResult {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        requiresMfa: this.mfa.isMfaRequired(user),
      },
    };
  }
}