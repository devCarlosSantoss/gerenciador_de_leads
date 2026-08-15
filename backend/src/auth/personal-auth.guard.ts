import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PersonalJwtService } from "./personal-jwt.service";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class PersonalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: PersonalJwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Token de acesso não fornecido.");
    }

    const token = authHeader.slice(7);
    const payload = await this.jwt.verifyAccessToken(token);

    if (!payload) {
      throw new UnauthorizedException("Token inválido ou expirado.");
    }

    request.user = payload;
    return true;
  }
}