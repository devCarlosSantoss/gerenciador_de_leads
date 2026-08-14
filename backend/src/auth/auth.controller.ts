import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthService, type RequestContext } from "./auth.service";
import { Public } from "./public.decorator";
import { CurrentUser } from "./current-user.decorator";
import type { AccessTokenPayload } from "./jwt.service";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken é obrigatório"),
});

const forgotSchema = z.object({
  email: z.string().email("E-mail inválido"),
});

const resetSchema = z.object({
  token: z.string().min(1, "token é obrigatório"),
  newPassword: z.string().min(1, "newPassword é obrigatório"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  newPassword: z.string().min(1, "Nova senha é obrigatória"),
});

function ctxFrom(req: Request): RequestContext {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.ip;
  return { ip, userAgent: req.headers["user-agent"] };
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      error: "Payload inválido",
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  return result.data;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request) {
    const { email, password } = parse(loginSchema, body);
    return this.auth.login(email, password, ctxFrom(req));
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: Request) {
    const { refreshToken } = parse(refreshSchema, body);
    return this.auth.refresh(refreshToken, ctxFrom(req));
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Body() body: unknown, @Req() req: Request) {
    const parsed = refreshSchema.safeParse(body ?? {});
    if (parsed.success) {
      await this.auth.logout(parsed.data.refreshToken, ctxFrom(req));
    }
    return { ok: true };
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown, @Req() req: Request) {
    const { email } = parse(forgotSchema, body);
    return this.auth.requestPasswordReset(email, ctxFrom(req));
  }

  @Public()
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() body: unknown, @Req() req: Request) {
    const { token, newPassword } = parse(resetSchema, body);
    await this.auth.resetPassword(token, newPassword, ctxFrom(req));
    return { ok: true };
  }

  @Post("password/change")
  @HttpCode(200)
  async changePassword(
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    const { currentPassword, newPassword } = parse(changePasswordSchema, body);
    await this.auth.changePassword(user.sub, currentPassword, newPassword, ctxFrom(req));
    return { ok: true };
  }

  @Get("me")
  async me(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.me(user.sub);
  }
}