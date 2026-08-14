import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { GeminiProvider } from "./providers/gemini.provider";
import { GroqProvider } from "./providers/groq.provider";
import type { AiProvider, StructuredOutputOptions } from "./providers/provider.interface";
import { config } from "../config/env";

/**
 * Orquestrador de provedores de IA: tenta a Gemini primeiro e, se ela falhar
 * (cota esgotada, 429/503, saída inválida), faz fallback automático para o Groq.
 * A ordem e a disponibilidade são controladas por env.
 */
@Injectable()
export class AiService implements AiProvider {
  private readonly logger = new Logger(AiService.name);
  private readonly providers: AiProvider[];
  private lastUsed = "";

  constructor() {
    const chain: AiProvider[] = [new GeminiProvider()];
    if (config.GROQ_API_KEY) {
      chain.push(new GroqProvider());
    }
    this.providers = chain;
  }

  get provider(): AiProvider {
    return this;
  }

  get name(): string {
    return this.lastUsed || this.providers[0]?.name || "unknown";
  }

  async generateStructured<S extends z.ZodType>(opts: StructuredOutputOptions<S>) {
    let lastError: Error | null = null;
    for (const provider of this.providers) {
      try {
        const res = await provider.generateStructured(opts);
        this.lastUsed = provider.name;
        return res;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `Provedor ${provider.name} falhou; tentando o próximo. Motivo: ${lastError.message}`,
        );
      }
    }
    throw lastError ?? new Error("Todos os provedores de IA falharam");
  }
}
