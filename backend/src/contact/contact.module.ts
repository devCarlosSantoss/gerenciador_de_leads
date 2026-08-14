import { Module } from "@nestjs/common";
import { ContactLifecycleService } from "./contact-lifecycle.service";
import { ContactController } from "./contact.controller";

@Module({
  controllers: [ContactController],
  providers: [ContactLifecycleService],
  exports: [ContactLifecycleService],
})
export class ContactModule {}
