import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Response } from "express";
import { isProduction } from "../config/env";

const SENSITIVE_PATTERNS = [
  /(bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
  /(refresh[_T]?oken["'=:\s]+)[A-Za-z0-9\-._~+/]+/gi,
  /(password|senha|currentPassword|newPassword)["']?\s*[:=]\s*["'][^"']*["']/gi,
  /(ADMIN_INITIAL_PASSWORD|JWT_SECRET|GEMINI_API_KEY|GROQ_API_KEY|PAGESPEED_API_KEY)\s*[:=]\s*[^\s,;]+/g,
  /eyJ[A-Za-z0-9\-._~+/=]+/g, // tokens JWT
];

/** Remove valores sensíveis (tokens, senhas, chaves) de mensagens antes de logar. */
export function redact(input: string): string {
  let out = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, (match, group1?: string) =>
      group1 ? `${group1}[REDACTED]` : "[REDACTED]",
    );
  }
  return out;
}

/**
 * Filtro global: loga e responde de forma SEGURA.
 * - Erros de validação/HttpException são repassados ao cliente (mensagem controlada).
 * - Erros internos (500) retornam resposta genérica em produção e nunca expõem
 *   tokens/senhas em logs (redação aplicada).
 */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(body);
      return;
    }

    const rawMessage =
      exception instanceof Error
        ? `${exception.message}\n${exception.stack ?? ""}`
        : `Erro desconhecido: ${String(exception)}`;
    this.logger.error(redact(rawMessage));

    const message = isProduction ? "Erro interno do servidor" : redact(exception instanceof Error ? exception.message : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message });
  }
}