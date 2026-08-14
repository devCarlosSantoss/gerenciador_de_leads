import { z } from "zod";

/**
 * DTOs NestJS para os endpoints de análise estruturada.
 * Seguem o padrão do projeto: validação com Zod no código (sem class-validator).
 */

/** Corpo de POST /leads/:id/analyze — sem parâmetros por enquanto. */
export const CreateAnalysisDtoSchema = z.object({}).default({});
export type CreateAnalysisDto = z.infer<typeof CreateAnalysisDtoSchema>;

/** Query de GET /leads/:id/findings — permite consultar um run específico. */
export const FindingsQueryDtoSchema = z.object({
  runId: z.string().min(1).max(64).optional(),
});
export type FindingsQueryDto = z.infer<typeof FindingsQueryDtoSchema>;