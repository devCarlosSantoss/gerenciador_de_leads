import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import type { AiProvider, StructuredOutputOptions } from "./provider.interface";
import { config } from "../../config/env";

const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Provedor compatível com a API OpenAI (Groq/Cerebras/OpenRouter usam o mesmo
 * formato) via REST direto — tier gratuito, sem SDK. Usado como fallback
 * quando a cota gratuita da Gemini é esgotada (seção 4.3 do plano).
 */
@Injectable()
export class GroqProvider implements AiProvider {
  readonly name = `groq:${config.GROQ_MODEL}`;
  private readonly logger = new Logger(GroqProvider.name);

  async generateStructured<S extends z.ZodType>(opts: StructuredOutputOptions<S>) {
    if (!config.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY ausente — configure em https://console.groq.com");
    }

    const userBase = ["DADOS:", opts.userPrompt].join("\n");
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let userPrompt = userBase;
      if (attempt > 0 && lastError) {
        userPrompt = [
          userBase,
          "",
          "IMPORTANTE: a tentativa anterior NÃO atendeu ao formato exigido.",
          `Erro de validação: ${lastError.message}`,
          "Retorne AGORA somente o JSON válido, completo, sem markdown e sem campos faltando.",
        ].join("\n");
      }

      const raw = await this.request(opts.systemPrompt, userPrompt, opts.temperature ?? 0.4, opts.maxTokens ?? 4096);
      try {
        const value = this.parseStrict(raw, opts.schema);
        return { value, raw };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `Saída do Groq fora do schema (tentativa ${attempt + 1}/${MAX_RETRIES + 1}). Trecho: ${raw.slice(0, 300)}`,
        );
      }
    }

    throw lastError ?? new Error("Falha ao obter JSON estruturado do Groq");
  }

  private async request(systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number): Promise<string> {
    const payload = {
      model: config.GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" as const },
    };
    const url = `${config.GROQ_BASE_URL.replace(/\/$/, "")}/chat/completions`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.GROQ_API_KEY}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429 || res.status === 503) {
          const wait = 1500 * 2 ** attempt;
          this.logger.warn(`Groq ${res.status} — tentando de novo em ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("Groq retornou resposta vazia");
        return content;
      } catch (err) {
        if (attempt === 2) {
          this.logger.error(`Falha no Groq: ${(err as Error).message}`);
          throw err;
        }
      }
    }
    throw new Error(`Groq indisponível após múltiplas tentativas`);
  }

  private parseStrict<S extends z.ZodType>(rawText: string, schema: S): z.infer<S> {
    const cleaned = this.stripFences(rawText);
    return schema.parse(JSON.parse(cleaned));
  }

  private stripFences(text: string): string {
    const trimmed = text.trim();
    const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return fence ? fence[1] : trimmed;
  }
}
