// Stub para `next/headers` no ambiente de testes (vitest).
// As funções de cookie de `session.ts` não são exercitadas nos testes unitários,
// apenas as funções puras de JWT (verifyToken/signAccessToken).
export function cookies(): never {
  throw new Error("next/headers não está disponível no ambiente de testes (vitest)");
}