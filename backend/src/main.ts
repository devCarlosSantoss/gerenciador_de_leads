import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { config } from "./config/env";
import { SafeExceptionFilter } from "./common/safe-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ["log", "error", "warn"] });
  app.enableShutdownHooks();

  // CORS explícito: apenas origens listadas em CORS_ORIGIN (separadas por vírgula).
  const origins = config.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Org-ID", "X-User-ID"],
    credentials: false,
  });

  app.useGlobalFilters(new SafeExceptionFilter());

  await app.listen(config.PORT);
  Logger.log(`Aurora Prospecting API ouvindo em :${config.PORT} (${config.NODE_ENV})`);
}

void bootstrap();