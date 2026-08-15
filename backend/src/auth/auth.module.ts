import { Module } from "@nestjs/common";
import { PersonalAuthController } from "./personal-auth.controller";
import { PersonalAuthService } from "./personal-auth.service";
import { PasswordService } from "./password.service";
import { PersonalJwtService } from "./personal-jwt.service";
import { RateLimitService } from "./rate-limit.service";
import { PersonalAuthGuard } from "./personal-auth.guard";

@Module({
  controllers: [PersonalAuthController],
  providers: [
    PersonalAuthService,
    PasswordService,
    PersonalJwtService,
    RateLimitService,
    PersonalAuthGuard,
  ],
  exports: [PersonalJwtService, PasswordService, PersonalAuthGuard, PersonalAuthService],
})
export class AuthModule {}