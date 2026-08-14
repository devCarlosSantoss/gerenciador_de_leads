import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config/env";

export interface RegisterWorkerOptions {
  concurrency?: number;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: ConnectionOptions;
  private redis: IORedis | null = null;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor() {
    const url = new URL(config.REDIS_URL);
    const tls = url.protocol === "rediss:" ? {} : undefined;
    this.connection = {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      tls,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  /** Queue compartilhada por nome (cria se não existir). */
  queue<T = unknown>(name: string, defaultJobOptions?: JobsOptions): Queue<T> {
    const existing = this.queues.get(name);
    if (existing) return existing as Queue<T>;
    const queue = new Queue<T>(name, {
      connection: this.connection,
      defaultJobOptions: defaultJobOptions ?? { removeOnComplete: 1000, removeOnFail: 5000 },
    });
    this.queues.set(name, queue);
    return queue;
  }

  /** Registra um worker em processo. Desligável via env WORKERS_ENABLED=false. */
  registerWorker<D = unknown>(
    queueName: string,
    processor: (job: import("bullmq").Job<D>) => Promise<void>,
    opts: RegisterWorkerOptions = {},
  ): Worker | null {
    if (config.NODE_ENV === "test" || process.env.WORKERS_ENABLED === "false") {
      this.logger.log(`Worker '${queueName}' desabilitado`);
      return null;
    }
    const worker = new Worker(queueName, async (job) => processor(job), {
      connection: this.connection,
      concurrency: opts.concurrency ?? 1,
    });
    worker.on("failed", (job, err) => {
      this.logger.error(
        `Job falhou [${queueName}]:${job?.name ?? "?"} id=${job?.id} — ${err.message}`,
        err.stack,
      );
    });
    worker.on("error", (err) => {
      this.logger.error(`Erro no worker '${queueName}': ${err.message}`);
    });
    this.workers.push(worker);
    return worker;
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    if (this.redis) await this.redis.quit();
  }
}