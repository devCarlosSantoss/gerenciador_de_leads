import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AccessTokenPayload } from "./jwt.service";

/**
 * Injeta o usuário autenticado (payload do access token) em handlers
 * protegidos pelo JwtAuthGuard. Uso: `@CurrentUser() user: AuthUser`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AccessTokenPayload }>();
    return request.user;
  },
);