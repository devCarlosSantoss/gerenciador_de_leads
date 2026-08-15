import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PersonalAuthService, AuthResult, RequestContext } from "./personal-auth.service";
import { PersonalAuthGuard } from "./personal-auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { UserAgent } from "./user-agent.decorator";

class LoginDto {
  email: string;
  password: string;
}

class ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

class RefreshDto {
  refreshToken: string;
}

@Controller("auth")
export class PersonalAuthController {
  constructor(private readonly auth: PersonalAuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<AuthResult> {
    return this.auth.login(dto.email, dto.password, { ip, userAgent });
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Ip() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<AuthResult> {
    return this.auth.refresh(dto.refreshToken, { ip, userAgent });
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Ip() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<{ ok: boolean }> {
    const authHeader = req.headers.get?.("authorization") ?? "";
    const refreshToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    await this.auth.logout(refreshToken, { ip, userAgent });
    return { ok: true };
  }

  @UseGuards(PersonalAuthGuard)
  @Post("password/change")
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser("sub") userId: string,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<{ ok: boolean }> {
    await this.auth.changePassword(userId, dto.currentPassword, dto.newPassword, { ip, userAgent });
    return { ok: true };
  }

  @UseGuards(PersonalAuthGuard)
  @Get("me")
  async me(@CurrentUser("sub") userId: string) {
    return this.auth.me(userId);
  }
}