import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { AdminUser } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "./password.service";
import { PersonalJwtService, type AccessTokenPayload } from "./personal-jwt.service";
import { RateLimitService } from "./rate-limit.service";
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
    mustChangePassword: boolean;
  };
}

@Injectable()
export class PersonalAuthService {
  private readonly logger = new Logger(PersonalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: PersonalJwtService,
    private readonly rateLimit: RateLimitService,
  ) {}

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

    const user = await this.prisma.adminUser.findUnique({
      where: { email },
    });

    if (!user || !user.active || !user.passwordHash) {
      await this.passwords.timingSafeDummyVerify();
      throw new UnauthorizedException("Credenciais inválidas ou conta bloqueada.");
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException("Credenciais inválidas ou conta bloqueada.");
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, password);
    if (!passwordOk) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= config.LOGIN_MAX_ATTEMPTS;
      await this.prisma.adminUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + config.LOGIN_LOCK_MS)
            : null,
        },
      });
      throw new UnauthorizedException("Credenciais inválidas ou conta bloqueada.");
    }

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user, ctx);

    return this.buildResult(user, tokens);
  }

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
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Sessão expirada. Faça login novamente.");
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Sessão expirada. Faça login novamente.");
    }

    const familyId = stored.familyId;
    const oldId = stored.id;

    const { accessToken, refreshToken: newRefresh, refreshTokenId } =
      await this.createRefreshToken(stored.user, familyId, ctx);
    await this.prisma.refreshToken.update({
      where: { id: oldId },
      data: { revokedAt: new Date(), replacedBy: refreshTokenId },
    });

    return this.buildResult(stored.user, {
      accessToken,
      refreshToken: newRefresh,
    });
  }

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
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.adminUser.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Usuário não encontrado.");
    }

    const currentOk = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!currentOk) {
      throw new UnauthorizedException("Senha atual incorreta.");
    }

    const strength = this.passwords.isStrong(newPassword);
    if (!strength.ok) throw new BadRequestException(strength.message);

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.adminUser.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async me(userId: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Usuário não encontrado.");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async bootstrapInitialAdmin(password: string): Promise<AdminUser> {
    const existing = await this.prisma.adminUser.findFirst();
    if (existing) {
      this.logger.log("Admin user já existe, pulando bootstrap.");
      return existing;
    }

    const strength = this.passwords.isStrong(password);
    if (!strength.ok) {
      throw new Error(`Senha inicial fraca: ${strength.message}`);
    }

    const passwordHash = await this.passwords.hash(password);

    const user = await this.prisma.adminUser.create({
      data: {
        email: "carlos@auroracode.tech",
        name: "Carlos Vinicius",
        passwordHash,
        mustChangePassword: true,
        active: true,
      },
    });

    this.logger.log("Admin user criado via bootstrap: carlos@auroracode.tech");
    return user;
  }

  private async issueTokens(
    user: AdminUser,
    ctx: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string; refreshTokenId: string }> {
    const familyId = this.passwords.generateToken(16);
    return this.createRefreshToken(user, familyId, ctx);
  }

  private async createRefreshToken(
    user: AdminUser,
    familyId: string,
    ctx: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string; refreshTokenId: string }> {
    const refreshToken = this.passwords.generateToken(32);
    const refreshExpiry = Date.now() + config.JWT_REFRESH_TTL_DAYS * 86400 * 1000;

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      type: "access",
    };
    const accessToken = await this.jwt.signAccessToken(accessPayload);

    const created = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
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
    user: AdminUser,
    tokens: { accessToken: string; refreshToken: string },
  ): AuthResult {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}