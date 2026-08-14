import type { z } from "zod";

export interface StructuredOutputOptions<S extends z.ZodType> {
  systemPrompt: string;
  userPrompt: string;
  schema: S;
  temperature?: number;
  maxTokens?: number;
}

export interface AiProvider {
  readonly name: string;
  /** Retorna a saída estruturada validada pelo schema. */
  generateStructured<S extends z.ZodType>(
    opts: StructuredOutputOptions<S>,
  ): Promise<{ value: z.infer<S>; raw: string }>;
}