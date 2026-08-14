import { Module } from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { MessagesController } from "./messages.controller";
import { ContactModule } from "../contact/contact.module";
import { FindingsService } from "../analysis/findings.service";

@Module({
  imports: [ContactModule],
  controllers: [MessagesController],
  providers: [MessagesService, FindingsService],
  exports: [MessagesService],
})
export class MessagesModule {}