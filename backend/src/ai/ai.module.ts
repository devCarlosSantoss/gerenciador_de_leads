import { Global, Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { GuardrailsService } from "./guardrails.service";

@Global()
@Module({
  providers: [AiService, GuardrailsService],
  exports: [AiService, GuardrailsService],
})
export class AiModule {}