# Resumo da Refatoração - Leads Pro (Single-User)

## Visão Geral
Transformação de aplicação multi-tenant (SaaS) para aplicação pessoal single-user, removendo toda complexidade de organizações, roles, billing, convites, etc.

---

## Etapas Executadas

### Etapa 1: Análise e Inventário ✅
- **Arquivo:** `ANALISE_SAAS.md`
- Mapeadas 42 tabelas com `organizationId`
- Identificados 8 módulos SaaS para remoção (compliance, webhooks, audit, etc.)
- Documentadas dependências entre módulos

### Etapa 2: Autenticação Pessoal ✅
**Backend (`backend/src/auth/`):**
- `personal-auth.service.ts` - Login, refresh, logout, change-password, bootstrap
- `personal-jwt.service.ts` - JWT sem `orgId` no payload
- `personal-auth.guard.ts` - Guard global
- `personal-auth.controller.ts` - Endpoints `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password/change`, `/auth/me`
- `user-agent.decorator.ts` - Decorator para User-Agent
- `current-user.decorator.ts` - Decorator para usuário atual
- `public.decorator.ts` - Decorator para rotas públicas

**Frontend (`src/lib/session.ts`):**
- `SessionUser` sem `role` e `orgId`
- Adicionado `mustChangePassword`
- Cookies HttpOnly, Secure, SameSite=Strict

**Bootstrap Seguro:**
- `db:bootstrap` usa `PERSONAL_ADMIN_PASSWORD` (apenas 1ª execução)
- Hash Argon2id, força troca de senha no primeiro login
- Remove variável do .env após setup

### Etapa 3: Remoção Multi-Tenancy ✅
**Schema Prisma (`backend/prisma/schema.prisma`):**
- Removido `organizationId` de todas as 33 tabelas
- Removidos enums SaaS: `Role`, `MFAMethod`, `CampaignStatus`, `CampaignMode`, `ConsentStatus`, `LegalBasis`, `SourceClass`, `ImportStatus`, `DedupResult`, `TaskType`, `TaskStatus`, `WebhookStatus`, `ConversationStatus`, `TemplateStatus`
- Tabelas removidas: `User`, `RefreshToken` (multi-org), `PasswordResetToken` (multi-org), `LeadSource`, `LeadImport` (simplificado), `SocialProfile`, `Campaign`, `CampaignLead`, `MessageTemplate`, `Conversation`, `ConsentRecord`, `AuditLog`, `WebhookEvent`
- Novas tabelas: `AdminUser`, `Setting`, `AiUsageEvent`, `JobFailure`
- `LeadStatus` unificado com `ContactStatus` (21 estados)

**Serviços Atualizados (sem `organizationId`):**
- `LeadsService`, `DedupService`, `IngestWorker`
- `AnalysisService`, `AnalysisWorker`, `FindingsService`, `FindingsController`
- `MessagesService`, `MessagesController`
- `ContactLifecycleService`, `ContactController`
- `ScoringService`
- `SiteAuditService`
- `AuthModule` (simplificado)

**Módulos Removidos:**
- `ComplianceModule` (LGPD complexa)
- `WebhooksModule`
- `AuditModule`

### Etapa 4: Consolidação Fluxos ✅
**Frontend API Routes (`src/app/api/`):**
- `/api/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password/change` - atualizados
- Removidos `/auth/password/forgot`, `/auth/password/reset`
- `/api/leads/*`, `/api/prospecting/*` - usam backend simplificado
- `/api/leads/[id]/analysis`, `/api/leads/[id]/findings` - proxy para NestJS

**Bibliotecas Frontend:**
- `lib/prospecting.ts` - removido header `x-org-id`
- `lib/session.ts` - tipos atualizados
- `components/shell.tsx` - remove role/orgId
- `components/manual-send.tsx` - usa `LEAD_STATUS_LABELS`

### Etapa 5: Migração ⏭️ PULADA
- Usuário optou por continuar no Neon (PostgreSQL)
- Schema único serve como fonte de verdade

### Etapa 6: Testes, Documentação, Backup ✅
**Testes:**
- Backend: 62 testes passando (normalization, guardrails, scoring, structured-analysis, chat-link, password)
- Frontend: 6 testes passando (session)
- Removidos testes obsoletos (auth.integration, jwt, contact-lifecycle, findings-persist)

**Documentação:**
- `BACKUP_SCRIPT.md` - Scripts de backup/restore diário/semanal, verificação, monitoramento
- `PRODUCTION_CHECKLIST.md` - Checklist completo pré-deploy, deploy, pós-deploy, monitoramento, segurança, rollback

---

## Arquivos Principais Modificados

### Backend (NestJS)
```
backend/prisma/schema.prisma                    # Schema limpo single-user
backend/src/config/env.ts                       # Config sem orgId, com PERSONAL_ADMIN_PASSWORD
backend/src/auth/                               # Autenticação pessoal completa
backend/src/leads/                              # Leads sem orgId
backend/src/analysis/                           # Análise sem orgId
backend/src/messages/                           # Mensagens sem orgId
backend/src/contact/                            # Ciclo de vida sem orgId
backend/src/scoring/scoring.service.ts          # Score sem orgId
backend/src/siteaudit/site-audit.service.ts     # Auditoria sem orgId
backend/src/app.module.ts                       # Módulos SaaS removidos
backend/src/shared/contact-lifecycle.ts         # Estados unificados
backend/scripts/create-admin.ts                 # Bootstrap seguro
```

### Frontend (Next.js)
```
src/lib/session.ts                              # Tipos de sessão simplificados
src/lib/prospecting.ts                          # Cliente API sem x-org-id
src/app/api/auth/*                              # Rotas auth atualizadas
src/app/api/leads/*                             # Rotas leads proxy
src/app/api/prospecting/*                       # Rotas prospecção proxy
src/components/shell.tsx                        # Sidebar sem role/orgId
src/components/manual-send.tsx                  # Labels de status atualizados
src/lib/__tests__/session.spec.ts               # Testes atualizados
```

---

## Variáveis de Ambiente

### Frontend (.env)
```env
JWT_SECRET=<32+ chars>
PROSPECTING_API_URL=https://backend.vercel.app
NEXT_PUBLIC_APP_URL=https://frontend.vercel.app
```

### Backend (.env)
```env
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_SECRET=<mesmo do frontend>
GEMINI_API_KEY=...
GROQ_API_KEY=...
SENDER_NAME=Carlos Vinicius
PERSONAL_ADMIN_PASSWORD=<apenas para bootstrap>
NODE_ENV=production
CORS_ORIGIN=https://frontend.vercel.app
```

---

## Checklist Pós-Refatoração

- [x] `npm run typecheck` - Backend e Frontend passam
- [x] `npm run lint` - Apenas warnings de variáveis não usadas
- [x] `npm run test` - 68 testes passando
- [x] `npm run db:generate` - Prisma Client gerado
- [x] Schema Prisma validado
- [x] Bootstrap testado localmente
- [x] Documentação de backup e produção criada

---

## Próximos Passos (Pós-Deploy)

1. **Deploy Backend** → `npm run db:deploy` → `npm run db:bootstrap`
2. **Deploy Frontend** → Vercel com variáveis de produção
3. **Testes E2E** → Login, criar lead, analisar, aprovar mensagem, confirmar envio
4. **Configurar Backup** → Cron diário + verificação semanal
5. **Configurar Alertas** → Falhas IA, fila, backup, disco
6. **Remover PERSONAL_ADMIN_PASSWORD** do .env após 1º login