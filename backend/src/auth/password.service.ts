import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { config } from "../config/env";

/**
 * Hash usado apenas para igualar o tempo de resposta quando o e-mail
 * informado não existe (evita user enumeration via timing attack).
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$2S1UDtMp4aQXXD3ubhxO0w$cwjowMUjfKl5onCAb7NCyuzx/NgkoquYRIqZFm6laOo";

export const PASSWORD_POLICY = {
  minLength: config.PASSWORD_MIN_LENGTH,
  maxLength: config.PASSWORD_MAX_LENGTH,
} as const;

@Injectable()
export class PasswordService {
  /** Hash de senha com Argon2id (OWASP recommendation p/ sistemas novos). */
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MiB
      timeCost: 3,
      parallelism: 4,
    });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /** Equaliza o tempo de resposta quando o usuário não existe. */
  async timingSafeDummyVerify(): Promise<void> {
    await argon2.verify(DUMMY_HASH, "dummy-timing-equalizer");
  }

  /**
   * Política de senha forte: comprimento mínimo de 12 e ao menos 3 das 4
   * classes de caracteres (minúsculas, maiúsculas, dígitos, símbolos).
   */
  isStrong(plain: string): { ok: boolean; message: string } {
    if (typeof plain !== "string" || plain.length < PASSWORD_POLICY.minLength) {
      return {
        ok: false,
        message: `A senha deve ter no mínimo ${PASSWORD_POLICY.minLength} caracteres.`,
      };
    }
    if (plain.length > PASSWORD_POLICY.maxLength) {
      return {
        ok: false,
        message: `A senha deve ter no máximo ${PASSWORD_POLICY.maxLength} caracteres.`,
      };
    }
    const classes = [
      /[a-z]/.test(plain) ? 1 : 0,
      /[A-Z]/.test(plain) ? 1 : 0,
      /[0-9]/.test(plain) ? 1 : 0,
      /[^A-Za-z0-9]/.test(plain) ? 1 : 0,
    ].reduce((a, b) => a + b, 0);
    if (classes < 3) {
      return {
        ok: false,
        message:
          "A senha deve conter ao menos 3 das 4 classes: minúscula, maiúscula, número e símbolo.",
      };
    }
    return { ok: true, message: "" };
  }

  /** Token aleatório (para refresh e recuperação de senha). */
  generateToken(byteLength = 32): string {
    return randomBytes(byteLength).toString("base64url");
  }

  /** Hash do token para armazenar no banco (nunca o token em texto puro). */
  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}