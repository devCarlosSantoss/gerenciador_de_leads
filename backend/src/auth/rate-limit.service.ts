import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import IORedis from "ioredis";
import { config } from "../config/env";

/**
 * Rate limiting baseado em Redis (janela deslizante simples com INCR/EXPIRE).
 * Em `test` ou quando o Redis está indisponível, degrada para um contador
 * em memória — nunca derruba o fluxo de autenticação.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: IORedis | null = null;
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    if (config.NODE_ENV === "test") return;
    try {
      const url = new URL(config.REDIS_URL);
      this.redis = new IORedis({
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password || undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: true,
      });
    } catch (err) {
      this.logger.warn(
        `Rate limiting em memória (Redis indisponível): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Verifica se a chave excedeu `limit` requisições na janela `windowMs`.
   * Retorna true quando a requisição é permitida (dentro do limite).
   */
  async check(key: string, limit: number, windowMs: number): Promise<boolean> {
    if (this.redis) {
      try {
        const count = await this.redis.incr(key);
        if (count === 1) await this.redis.expire(key, Math.ceil(windowMs / 1000));
        return count <= limit;
      } catch {
        this.redis?.disconnect();
        // degrade para memória abaixo
      }
    }
    return this.checkMemory(key, limit, windowMs);
  }

  private checkMemory(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.resetAt < now) {
      this.memory.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit();
  }
}