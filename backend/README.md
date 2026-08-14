# Aurora Prospecting API (Fase 1 — MVP seguro)

Backend NestJS da plataforma de prospecção B2B com IA. **Fase 1 não envia mensagens**
— só importa, analisa, pontua, gera rascunhos e registra consentimento/opt-out.

## Stack (tudo free)

| Camada | Escolha | Por quê |
|---|---|---|
| Backend | NestJS + TypeScript | mesmo idioma do frontend Next.js, BullMQ/Prisma nativos |
| Banco | PostgreSQL (local ou Neon free) | schema completo em `prisma/schema.prisma` |
| Fila | BullMQ + Redis (Upstash free / Docker) | jobs assíncronos com retry/DLQ |
| IA | Gemini API (tier gratuito) | REST direto, sem SDK, chave do Google AI Studio |
| Envio | WhatsApp Cloud API (free tier) — **Fase 2** | oficial; **nada de WhatsApp Web** |

## Setup

```bash
cp .env.example .env   # preencha DATABASE_URL e REDIS_URL
npx prisma migrate dev # cria o schema
npm run dev            # API em :3001
```

Testes: `npm test` (vitest) · Typecheck: `npm run typecheck`.

## Endpoints (Fase 1)

- `POST /leads/import` — contrato da seção 1.2 do plano (normaliza, valida, deduplica).
- `GET /leads` · `GET /leads/:id` — lista/detalhe consolidado.
- `POST /leads/:id/analyze` — enfileira a análise IA e já cria o registro `QUEUED`.
- `GET /leads/:id/analyze` — status/resultado da análise mais recente (`QUEUED` → `RUNNING` → final),
  com `startedAt`, `finishedAt`, `durationMs` e `elapsedMs` ao vivo enquanto processa; retorna o JSON da IA.
- `POST /leads/:id/messages/generate` — 3 rascunhos com evidências + guardrails (nunca envia).
- `POST /leads/:id/messages/:mid/approve` — aprovação humana (Modo A).
- `GET /leads/:id/messages/:mid/chat-link` — link wa.me da mensagem aprovada (envio manual).
- `POST /consents` · `POST /suppression` · `GET /suppression?companyId=` — LGPD.
- `POST /webhooks/:provider` — idempotente por `eventId` (Fase 2 processa de verdade).

### Ciclo de vida de contato (máquina de estados)

Abrir o link ou copiar a mensagem **nunca** confirma o envio — apenas a confirmação
explícita do operador (`confirm-send`) move o lead para `CONTACTED_CONFIRMED`.
Todas as transições são validadas contra `ALLOWED_TRANSITIONS`, gravadas em
`lead_status_history` (histórico), `contact_attempts` (tentativas com usuário/
canal/mensagem) e `activity_events`, tudo em uma transação única.

- `GET /leads/:id/contact` — estado atual + histórico + tentativas + eventos.
- `POST /leads/:id/contact/chat-link/open` — `{ "messageId" }` (registra a abertura).
- `POST /leads/:id/contact/copy` — `{ "messageId" }` (registra a cópia).
- `POST /leads/:id/contact/confirm-send` — `{ "messageId" }` confirma o envio
  (exige mensagem aprovada, ausência de confirmação anterior e não estar suprimido).
- `POST /leads/:id/contact/reply` — `{ "content" }` registra resposta do lead.
- `POST /leads/:id/contact/opt-out` — `{ "reason" }` insere na suppression list.
- `POST /leads/:id/contact/status` — transição genérica: `{ "to": "QUALIFIED" }`
  (também `MEETING_BOOKED`, `PROPOSAL_SENT`, `CONVERTED`, `NOT_INTERESTED`,
  `LOST`, `ARCHIVED`, `BLOCKED`, `ERROR` e recontato `NEW`).

Os estados e a matriz de transições vivem em `src/shared/contact-lifecycle.ts`
(reutilizado pelo frontend). O status legado (`Company.status`) continua sendo
atualizado via `LEGACY_STATUS_MAP` para compatibilidade com a UI atual.

## Autenticação (autoridade do sistema)

O backend é a autoridade de autenticação do sistema (o frontend Next.js é cliente).
Todas as rotas, exceto `@Public()` (health, webhooks e o próprio `/auth/*`), exigem
`Authorization: Bearer <accessToken>` via guard global `JwtAuthGuard`.

- Senhas com hash **Argon2id** (`argon2`) e política de senha forte (mín. 12, máx. 128,
  3 de 4 classes de caracteres).
- **Access token** JWT HS256 (curto, padrão 15 min) + **refresh token** opaco (7 dias,
  armazenado apenas como hash SHA-256) com **rotação por família** e revogação da família
  em caso de reuso.
- **Lockout** após `LOGIN_MAX_ATTEMPTS` (5) falhas por `LOGIN_LOCK_MS` (15 min) e
  **rate limiting** por IP (Redis, com fallback em memória).
- Respostas de login/recuperação sempre **genéricas** (não revelam se o e-mail existe).
- MFA (TOTP/e-mail) preparado no schema (`mfaEnabled`/`mfaMethod`) — em implementação.
- Trilha de auditoria das ações de autenticação no banco (`auth.*` no `AuditLog`).

### Endpoints de autenticação

- `POST /auth/login` `{ email, password }` → `{ accessToken, refreshToken, user }`.
- `POST /auth/refresh` `{ refreshToken }` → novo par (rotaciona; reuso revoga a família).
- `POST /auth/logout` `{ refreshToken }` — revoga o refresh token.
- `POST /auth/forgot-password` `{ email }` — sempre resposta genérica; em dev/test devolve
  `resetToken` no corpo para permitir testar sem infra de e-mail.
- `POST /auth/reset-password` `{ token, newPassword }` — token de uso único (TTL padrão 30 min).
- `POST /auth/password/change` `{ currentPassword, newPassword }` (autenticado) — revoga
  todos os refresh tokens do usuário.
- `GET /auth/me` (autenticado) — dados da sessão atual.

Cabeçalho `X-Org-ID` simula o tenant do token JWT/OAuth (Fase 1).

### Criar o primeiro administrador

```bash
# Script (usa ADMIN_INITIAL_* do .env; sem expor a senha em logs)
npm run db:create-admin
# ou, apontando o .env:
node -r dotenv/config dist/scripts/create-admin.js
```

### Variáveis de autenticação (`.env`)

`JWT_SECRET` (≥32, obrigatória, **a mesma do frontend**), `JWT_ACCESS_TTL` (15m),
`JWT_REFRESH_TTL_DAYS` (7), `LOGIN_MAX_ATTEMPTS` (5), `LOGIN_LOCK_MS` (15m),
`LOGIN_RATE_LIMIT`/`LOGIN_RATE_WINDOW_MS` (10/60s), `RESET_TOKEN_TTL_MINUTES` (30),
`RESET_PASSWORD_BASE_URL`, `ADMIN_INITIAL_EMAIL`/`ADMIN_INITIAL_PASSWORD`/`ADMIN_INITIAL_NAME`,
`CORS_ORIGIN`. Ver `backend/.env.example`.

## Cobertura de testes

- `test/auth/password.spec.ts` — Argon2id, política de senha, hashing de tokens, verificação com timing.
- `test/auth/jwt.spec.ts` — assinatura HS256, expiração, type/claims, rejeição de token adulterado.
- `test/auth/auth.integration.spec.ts` — login, refresh (rotação/revogação), logout, forgot/reset/change, lockout, auditoria.

- `test/normalization.spec.ts` — telefone E.164, e-mail, domínio, handle, hash.
- `test/guardrails.spec.ts` — frases proibidas, emojis, nº de perguntas, evidência de personalização.
- `test/scoring.spec.ts` — pesos/faixas, hard-zero em opt-out, penalidades.
- `test/contact-lifecycle.spec.ts` — abrir/copiar não confirmam envio; guardas de
  confirmação (mensagem aprovada, duplicidade, suppression); transições válidas/
  inválidas; recontato; opt-out; compatibilidade legado.

## Notas de conformidade

- Scraper atual do Google Maps é tratado como `SCRAPED` (área cinzenta) → migrar para **Google Places API** na Fase 4.
- Nenhum lead legado é elegível a envio automático (`legalBasis=NO_BASIS`).
- Envio real (WhatsApp Cloud API) é **Fase 2** — exige conta Meta Business, templates aprovados e registro de opt-in.
- Instagram: apenas **inbound** (respostas a interações iniciadas pelo usuário) via Graph API — sem cold DM.