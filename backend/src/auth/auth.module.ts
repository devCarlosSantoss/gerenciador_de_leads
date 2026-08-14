import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { JwtService } from "./jwt.service";
import { RateLimitService } from "./rate-limit.service";
import { MfaService } from "./mfa.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    JwtService,
    RateLimitService,
    MfaService,
    JwtAuthGuard,
  ],
  exports: [JwtService, PasswordService, JwtAuthGuard, AuthService],
})
export class AuthModule {}