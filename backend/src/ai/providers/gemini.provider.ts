import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import type { AiProvider, StructuredOutputOptions } from "./provider.interface";
import { config } from "../../config/env";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Provedor Gemini (tier gratuito do Google AI Studio) via REST direto —
 * sem SDK, sem custo, chave simples. Saída estruturada validada por zod,
 * com re-tentativa corretiva quando o JSON não respeita o schema.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = `gemini:${config.GEMINI_MODEL}`;
  private readonly logger = new Logger(GeminiProvider.name);

  async generateStructured<S extends z.ZodType>(opts: StructuredOutputOptions<S>) {
    if (!config.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY ausente — configure o tier gratuito em https://aistudio.google.com");
    }

    const prompt = [opts.systemPrompt, "", "DADOS:", opts.userPrompt].join("\n");
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let userPrompt = prompt;
      if (attempt > 0 && lastError) {
        userPrompt = [
          prompt,
          "",
          "IMPORTANTE: a tentativa anterior NÃO atendeu ao formato exigido.",
          `Erro de validação: ${lastError.message}`,
          "Retorne AGORA somente o JSON válido, completo, sem markdown e sem campos faltando.",
        ].join("\n");
      }

      const raw = await this.request(userPrompt, opts.temperature ?? 0.4, opts.maxTokens ?? 4096);
      try {
        const value = this.parseStrict(raw, opts.schema);
        return { value, raw };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `Saída do Gemini fora do schema (tentativa ${attempt + 1}/${MAX_RETRIES + 1}). Trecho: ${raw.slice(0, 300)}`,
        );
      }
    }

    throw lastError ?? new Error("Falha ao obter JSON estruturado do Gemini");
  }

  private async request(prompt: string, temperature: number, maxTokens: number): Promise<string> {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
      },
    };
    const url = `${API_BASE}/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429 || res.status === 503) {
          const wait = 1500 * 2 ** attempt;
          this.logger.warn(`Gemini ${res.status} — tentando de novo em ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        }
        return this.extractText(await res.json());
      } catch (err) {
        if (attempt === 2) {
          this.logger.error(`Falha no Gemini: ${(err as Error).message}`);
          throw err;
        }
      }
    }
    throw new Error(`Gemini indisponível após múltiplas tentativas`);
  }

  private extractText(data: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }): string {
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    if (parts.length === 0) throw new Error("Gemini retornou resposta vazia");

    // Modelos recentes podem incluir partes de "thinking" antes do JSON.
    // Prefere a parte que parece JSON; senão, junta todas.
    for (const p of parts) {
      if (p.text && this.looksLikeJson(p.text)) return p.text;
    }
    return parts.map((p) => p.text ?? "").join("");
  }

  private looksLikeJson(text: string): boolean {
    const t = text.trim();
    return t.startsWith("{") || t.startsWith("[") || /^```(?:json)?\s*[{\[]/.test(t);
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