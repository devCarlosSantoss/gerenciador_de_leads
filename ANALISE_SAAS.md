# Análise de Funcionalidades SaaS - Leads Pro

## Resumo
O sistema atualmente é construído como multi-tenant (SaaS) com suporte a múltiplas organizações, usuários com roles, convites, MFA, billing, campanhas automatizadas, etc. Precisamos remover tudo isso para torná-lo uma aplicação pessoal single-user.

---

## 1. Schema Prisma (backend/prisma/schema.prisma) - 921 linhas

### Tabelas COM organizationId (MULTI-TENANT) - 42 tabelas

| Tabela | organizationId | Notas |
|--------|----------------|-------|
| User | ✅ | Roles: OWNER, ADMIN, OPERATOR, ANALYST, VIEWER |
| RefreshToken | ✅ | |
| PasswordResetToken | ✅ | |
| LeadSource | ✅ | |
| Company | ✅ | 9 índices únicos com orgId |
| Contact | ✅ | |
| LeadImport | ✅ | |
| Website | ✅ | |
| WebsiteAudit | ✅ | |
| SocialProfile | ✅ | |
| LeadScore | ✅ | |
| AnalysisRun | ✅ | |
| AnalysisFinding | ✅ | |
| AnalysisEvidence | ✅ | |
| AnalysisRecommendation | ✅ | |
| AnalysisConflict | ✅ | |
| Campaign | ✅ | |
| CampaignLead | ✅ | |
| MessageTemplate | ✅ | |
| Message | ✅ | |
| Conversation | ✅ | |
| ConsentRecord | ✅ | |
| SuppressionList | ✅ | |
| Task | ✅ | |
| AuditLog | ✅ | |
| WebhookEvent | ✅ | |
| ContactStatusHistory | ✅ | |
| ContactAttempt | ✅ | |
| ActivityEvent | ✅ | |

### Enums relacionados a SaaS
- `Role` (5 roles)
- `MFAMethod` (NONE, TOTP, EMAIL_OTP)
- `CampaignStatus`, `CampaignMode`
- `ConsentStatus`, `LegalBasis`
- `SourceClass`
- `ImportStatus`, `DedupResult`
- `TaskType`, `TaskStatus`
- `WebhookStatus`
- `ConversationStatus`
- `TemplateStatus`

### Tabelas a MANTER (sem organizationId ou simplificadas)
- `admin_user` (nova - single user)
- `Company` → `Lead` (simplificada)
- `Contact` → `LeadContact`
- `Website` → `LeadWebsite`
- `WebsiteAudit`
- `AnalysisRun`
- `AnalysisFinding`
- `AnalysisEvidence`
- `AnalysisRecommendation`
- `AnalysisConflict`
- `LeadScore`
- `Message` → `MessageDraft`
- `ContactStatusHistory`
- `ContactAttempt`
- `ActivityEvent`
- `SuppressionList`
- `Task` (simplificada - sem assigneeId)
- `settings` (nova - configurações pessoais)
- `ai_usage_events` (nova)
- `job_failures` (nova)

### Tabelas a REMOVER
- `User` → substituir por `admin_user`
- `RefreshToken` → simplificar (sem orgId)
- `PasswordResetToken` → simplificar
- `LeadSource` → simplificar (sem orgId)
- `LeadImport` → simplificar
- `SocialProfile` → integrar em Lead
- `Campaign`, `CampaignLead` → REMOVER
- `MessageTemplate` → REMOVER
- `Conversation` → REMOVER
- `ConsentRecord` → REMOVER (LGPD simplificada)
- `AuditLog` → REMOVER (ou simplificar)
- `WebhookEvent` → REMOVER
- `Task` → simplificar (sem assigneeId, orgId)

---

## 2. Módulos Backend com dependências SaaS

### Auth Module (src/auth/)
| Arquivo | Dependências SaaS | Ação |
|---------|-------------------|------|
| auth.service.ts | `organizationId`, `config.DEFAULT_ORG_ID`, roles, MFA | **REESCREVER** - single user |
| auth.controller.ts | Login, refresh, logout, password reset, MFA | **REESCREVER** |
| jwt.service.ts | `orgId` no payload | **SIMPLIFICAR** |
| jwt-auth.guard.ts | Verifica orgId | **SIMPLIFICAR** |
| current-user.decorator.ts | Extrai user + orgId | **SIMPLIFICAR** |
| password.service.ts | OK (independente) | MANTER |
| rate-limit.service.ts | OK (por IP) | MANTER |
| mfa.service.ts | MFA | **REMOVER** |
| public.decorator.ts | Rotas públicas | MANTER |

### Leads Module (src/leads/)
| Arquivo | Dependências SaaS | Ação |
|---------|-------------------|------|
| leads.controller.ts | `organizationId` | **SIMPLIFICAR** |
| leads.service.ts | `organizationId`, `externalId` dedup | **SIMPLIFICAR** |
| dedup.service.ts | `organizationId` unique constraints | **SIMPLIFICAR** |
| normalization.service.ts | OK | MANTER |
| ingest.worker.ts | `organizationId` | **SIMPLIFICAR** |

### Analysis Module (src/analysis/)
| Arquivo | Dependências SaaS | Ação |
|---------|-------------------|------|
| analysis.controller.ts | `organizationId` | **SIMPLIFICAR** |
| analysis.service.ts | `organizationId` | **SIMPLIFICAR** |
| findings.service.ts | `organizationId` | **SIMPLIFICAR** |
| findings.controller.ts | `organizationId` | **SIMPLIFICAR** |
| evidence-sanitizer.ts | OK | MANTER |
| deterministic-facts.ts | OK | MANTER |
| analysis.schemas.ts | OK (schemas Zod) | MANTER |

### Messages Module (src/messages/)
| Arquivo | Dependências SaaS | Ação |
|---------|-------------------|------|
| messages.service.ts | `organizationId` | **SIMPLIFICAR** |
| messages.controller.ts | `organizationId` | **SIMPLIFICAR** |

### Contact Module (src/contact/)
| Arquivo | Dependências SaaS | Ação |
|---------|-------------------|------|
| contact-lifecycle.service.ts | `organizationId` | **SIMPLIFICAR** |
| contact.controller.ts | `organizationId` | **SIMPLIFICAR** |

### Compliance Module (src/compliance/) - **REMOVER INTEIRO**
- compliance.service.ts - LGPD, consentimento, suppression
- compliance.controller.ts
- compliance.module.ts

### Audit Module (src/audit/) - **REMOVER OU SIMPLIFICAR**
- audit.service.ts - logs de auditoria multi-org
- audit.module.ts

### Webhooks Module (src/webhooks/) - **REMOVER**
- webhooks.service.ts
- webhooks.controller.ts
- webhooks.module.ts

### Queue Module (src/queue/) - OK (independente)
- queue.service.ts
- queue.module.ts

### AI Module (src/ai/) - OK (independente)
- ai.service.ts
- providers/*.ts
- guardrails.service.ts

### Scoring Module (src/scoring/) - OK
- scoring.service.ts
- scoring.module.ts

### SiteAudit Module (src/siteaudit/) - OK
- site-audit.service.ts
- site-audit.module.ts

### Health Module (src/health/) - OK
- health.controller.ts
- health.module.ts

---

## 3. Configuração (src/config/env.ts)

### Variáveis SaaS a REMOVER
- `DEFAULT_ORG_ID`
- `ADMIN_INITIAL_EMAIL`
- `ADMIN_INITIAL_PASSWORD`
- `ADMIN_INITIAL_NAME`
- `CORS_ORIGIN` (simplificar)

### Variáveis a ADICIONAR
- `PERSONAL_ADMIN_PASSWORD` (apenas para bootstrap inicial)

---

## 4. Frontend (src/)

### API Routes com dependências SaaS
| Arquivo | Ação |
|---------|------|
| api/auth/login/route.ts | **SIMPLIFICAR** - single user |
| api/auth/logout/route.ts | **SIMPLIFICAR** |
| api/auth/refresh/route.ts | **SIMPLIFICAR** |
| api/auth/password/change/route.ts | **SIMPLIFICAR** |
| api/auth/password/forgot/route.ts | **REMOVER** (não precisa) |
| api/auth/password/reset/route.ts | **REMOVER** |
| api/leads/*.ts | **SIMPLIFICAR** (sem orgId) |
| api/prospecting/*.ts | **SIMPLIFICAR** |

### Componentes
| Arquivo | Ação |
|---------|------|
| shell.tsx | Mostra role, orgId | **SIMPLIFICAR** |
| login page | OK | MANTER |
| components/manual-send.tsx | OK | MANTER |
| components/analysis-panel.tsx | OK | MANTER |

### Libs
| Arquivo | Ação |
|---------|------|
| lib/session.ts | `orgId` no SessionUser | **SIMPLIFICAR** |
| lib/prospecting.ts | `x-org-id` header | **SIMPLIFICAR** |

---

## 5. Scripts
| Arquivo | Ação |
|---------|------|
| scripts/create-admin.ts | **REESCREVER** - bootstrap personal user |

---

## 6. Dependências Entre Módulos (Grafo)

```
config/env.ts
    ↓
auth/ (jwt.service, rate-limit, password.service)
    ↓
leads/ → analysis/ → messages/ → contact/
    ↓         ↓           ↓
   scoring  siteaudit   compliance (REMOVER)
    ↓         ↓
   queue    ai
    ↓
  webhooks (REMOVER)
    ↓
  audit (REMOVER/SIMPLIFICAR)
```

---

## 7. Plano de Remoção por Etapas

### Etapa 1: Análise (ESTE DOCUMENTO) ✅

### Etapa 2: Autenticação Pessoal
1. Criar model `AdminUser` no Prisma (sem organizationId)
2. Criar `PersonalAuthService` simples (login, logout, change-password)
3. Criar `PersonalJwtService` (sem orgId no payload)
4. Criar guard `PersonalAuthGuard`
5. Bootstrap script com `PERSONAL_ADMIN_PASSWORD`
6. Atualizar frontend session.ts (remover orgId)
7. Atualizar login/logout API routes
8. Remover MFA, password reset, refresh token rotation complexa

### Etapa 3: Remoção Multi-tenancy
1. **Migration Prisma**: Remover `organizationId` de todas as tabelas
2. Remover unique constraints compostas com `organizationId`
3. Atualizar todos os services para não filtrar por `organizationId`
4. Remover `DEFAULT_ORG_ID` do config
5. Remover `x-org-id` header do lib/prospecting.ts
6. Remover módulos: compliance, webhooks, audit (ou simplificar)

### Etapa 4: Consolidação Fluxos
1. Simplificar `Company` → `Lead` (campos essenciais)
2. Unificar `LeadStatus` e `ContactStatus` em um enum único
3. Simplificar `Message` → `MessageDraft`
4. Remover `Campaign`, `CampaignLead`, `MessageTemplate`, `Conversation`
5. Simplificar `Task` (sem assigneeId)
6. Criar `settings` table para configurações pessoais
7. Criar `ai_usage_events` e `job_failures` tables

### Etapa 5: Migração Neon → PostgreSQL
1. Script de importação idempotente (preservar externalId)
2. Dry-run, import, reconcile commands
3. Frontend usando apenas API NestJS
4. Desligar banco legado

### Etapa 6: Testes e Produção
1. Executar testes existentes
2. Backup automatizado
3. Documentação
4. Checklist produção

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Quebrar foreign keys ao remover orgId | Alta | Alto | Migration cuidadosa, backup antes |
| Perder dados de leads existentes | Média | Crítico | Dry-run, validação, rollback plan |
| Frontend quebrar com API changes | Alta | Alto | Testes integração, deploy gradual |
| Auth falhar para usuário existente | Baixa | Crítico | Bootstrap script testado localmente |
| Performance degradada sem índices orgId | Baixa | Médio | Recriar índices otimizados |

---

## 9. Estimativa de Arquivos a Modificar

| Categoria | Arquivos |
|-----------|----------|
| Prisma Schema | 1 (backend/prisma/schema.prisma) |
| Migrations | ~5-10 novas migrations |
| Auth Module | 8 arquivos (reescrever 5, remover 2, simplificar 1) |
| Leads Module | 5 arquivos |
| Analysis Module | 7 arquivos |
| Messages Module | 3 arquivos |
| Contact Module | 3 arquivos |
| Compliance Module | 3 arquivos (REMOVER) |
| Webhooks Module | 3 arquivos (REMOVER) |
| Audit Module | 2 arquivos (REMOVER/SIMPLIFICAR) |
| Config | 1 arquivo |
| Frontend API Routes | 7 arquivos |
| Frontend Libs | 2 arquivos |
| Frontend Components | 2 arquivos |
| Scripts | 1 arquivo |
| **TOTAL** | **~55 arquivos** |

---

## 10. Próximos Passos Imediatos

1. ✅ Análise completa (este documento)
2. Criar branch `refactor/personal-app`
3. Iniciar **Etapa 2**: Autenticação Pessoal
   - Novo schema `AdminUser`
   - `PersonalAuthService`
   - Bootstrap script
   - Testes de login/logout