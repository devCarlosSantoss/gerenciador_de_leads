import { Injectable } from "@nestjs/common";
import type { User, MFAMethod } from "@prisma/client";

/**
 * Placeholder para MFA (Fase 2). O login já expõe `requiresMfa` quando o
 * usuário habilitar o método; o desafio (TOTP/email) será implementado aqui.
 * Hoje nenhum usuário tem MFA habilitado, então o fluxo segue direto.
 */
@Injectable()
export class MfaService {
  isMfaRequired(user: Pick<User, "mfaEnabled" | "mfaMethod">): boolean {
    return user.mfaEnabled && user.mfaMethod !== ("NONE" as MFAMethod);
  }

  /**
   * Será implementado na Fase 2: verifica o código TOTP/OTP informado.
   * Retornar `false` aqui impede a ativação acidental enquanto o fluxo
   * de verificação não existe.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async verifyChallenge(_user: Pick<User, "mfaMethod" | "mfaSecretEncrypted">, _code: string): Promise<boolean> {
    return false;
  }
}