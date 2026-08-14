# Plano Técnico — Plataforma de Prospecção B2B com IA (Aurora Code Tech)

> **Escopo:** evoluir o sistema atual (`gerenciador_de_leads`, Next.js 16 + Prisma + PostgreSQL + Playwright) para uma plataforma de prospecção com análise por IA, personalização de mensagens e automação **controlada** do primeiro contato via integrações oficiais.
>
> **Princípio central:** qualidade e personalização antes de volume. Todo contato automatizado exige base legal, consentimento ou interação prévia, e permanece auditável e interrompível.

---

## 0. Análise do sistema atual e suposições

### 0.1 Estado atual (verificado no código)

| Componente | Implementação atual | Observação |
|---|---|---|
| Framework | Next.js 16 (App Router), TypeScript | Página `(app)` + API routes |
| ORM/DB | Prisma 7 + PostgreSQL | Modelo único `Lead` com 8 campos úteis |
| Coleta | `src/lib/scraper/google-maps.ts` (Playwright/Chromium headless) | Scraping de resultados do Google Maps |
| Auth | Cookie JWT simples, credenciais `ADMIN_USER`/`ADMIN_PASSWORD` em `.env` | Sem RBAC, sem multi-org |
| Entrada | Formulário manual, CSV (`/api/import`), captura (`/api/scrape`, `/api/leads/batch`) | Dedup básica por telefone ou nome+cidade |
| UI | Dashboard, lista/detalhe/editar, capturar, importar | Sem análise, sem campanhas, sem mensagens |
| Deploy | Docker + Render | README documenta limitações (Vercel não roda Chromium) |

### 0.2 Suposições explícitas

1. O negócio é **single-tenant hoje**, mas o modelo deve nascer **multi-org** (`organizationId`) para permitir clientes futuros sem migração.
2. A fonte atual (Google Maps via Playwright) será tratada como **"dados públicos coletados por scraping"** — com risco legal/compliance — e o roadmap migra para **Google Places API (oficial)** como fonte preferencial.
3. Não existe hoje base de consentimento. Portanto, **nenhum lead da base atual pode ser contatado automaticamente** — no máximo *draft* para revisão humana. Primeiro contato só com autorização explícita da política da plataforma (ex.: número ligou primeiro, WhatsApp Business com template aprovado e opt-in registrado).
4. IA: arquitetura agnóstica de provedor (OpenAI, Anthropic, Gemini) via interface própria.
5. Envio de WhatsApp será via **WhatsApp Business Platform/Cloud API** (oficial) ou BSP homologado. **Não** haverá automação de WhatsApp Web.
6. Instagram será usado apenas dentro das permissões da **Instagram Graph API** (Meta), sem cold DM em massa.
7. O plano assume uma **etapa de descoberta jurídica** antes do go-live (consultoria LGPD + revisão das políticas do WhatsApp/Meta).
8. Métricas/valores como pesos de score, limites de frequência e horários são **parâmetros configuraveis**, com defaults sugeridos aqui.

### 0.3 Perguntas que precisam de resposta antes da implementação

1. A prospecção será **unicamente B2B** ou há consumidores finais (afeta LGPD e política do WhatsApp)?
2. O número de WhatsApp da Aurora Code Tech é **individual ou Business**? Conta de **API Cloud** já solicitada?
3. Existe contrato com **BSP** (Twilio, Zenvia, Gupshup, etc.) ou integração direta com Meta?
4. Há orçamento para **Google Places API**, **PageSpeed Insights API** e **LLM** (custos por chamada)? Em qual faixa?
5. A empresa já possui conta **Instagram Business** + Página no Facebook (pré-requisito da API de mensagens)?
6. Quem são os papéis de usuário? Quantos operadores?
7. Qual SLA de resposta ao cliente (define follow-up automático)?
8. Região de processamento dos dados (GCP região; requisitos LGPD de residência)?
9. O sistema deve manter o deploy no Render ou migra de fato para GCP (Cloud Run/Cloud SQL)?

---

## 1. Análise do sistema atual e evolução

### 1.1 Estratégia de adaptação

O scraper atual produz um `ScrapedLead` (nome, telefone, whatsapp, website, endereço, cidade, UF, categoria, rating, reviews, sourceUrl, rawText). A evolução não joga fora essa coleta — ela se torna **apenas um "importador" (fonte)** dentro do pipeline. O contrato de entrada passa a ser **normalizado e versionado**, e a captura passa a gravar **dados brutos + normalizados + derivados** separadamente.

### 1.2 Contrato de entrada de um lead

Contrato JSON aceito pelo `POST /api/v1/leads/import` (batch) ou pelo job de ingestão. Campos:

```jsonc
{
  "sourceKey": "google_maps_playwright",        // chave cadastrada em lead_sources
  "sourceUrl": "https://www.google.com/maps/place/...",
  "externalId": "ChIJ....",                      // id da plataforma de origem (Google Place ID)
  "collectedAt": "2026-08-13T14:30:00Z",         // momento da coleta na origem
  "purpose": "prospeccao_comercial_servicos_digitais", // finalidade LGPD
  "company": {
    "name": "Mecânica Silva Ltda",               // obrigatório
    "category": "Oficina mecânica",
    "address": "R. das Flores, 123 – Centro",
    "city": "São Paulo",
    "state": "SP",
    "postalCode": "01000-000",
    "latitude": -23.5505,                        // opcional
    "longitude": -46.6333,                       // opcional
    "website": "https://mecanicasilva.com.br",   // opcional (normalizado)
    "phone": "+55 11 91234-5678",                // opcional
    "whatsapp": "+55 11 91234-5678",             // opcional (só se explicitamente WhatsApp)
    "rating": 4.6,                               // opcional, somente se licenciado
    "reviewsCount": 132                          // opcional, somente se licenciado
  },
  "contacts": [
    { "type": "phone", "value": "+55 11 91234-5678", "isPrimary": true },
    { "type": "email", "value": "contato@mecanicasilva.com.br" },
    { "type": "instagram", "value": "@mecanicasilva" }
  ],
  "raw": { /* payload original do importador, imutável, para auditoria */ }
}
```

**Campos obrigatórios:** `sourceKey`, `collectedAt`, `purpose`, `company.name`.
**Campos condicionais:** telefone/email/website exigem validação (1.4) e são **sempre** opcionais — a ausência é dado (afeta score), não erro.
**Campos proibidos de gravar da origem (scraping):** avaliações textuais, imagens, conteúdo protegido por direitos autorais. `rating`/`reviewsCount` só entram se a fonte for **licenciada/oficial**.

### 1.3 Separação de camadas de dados

| Camada | Tabela | Descrição |
|---|---|---|
| **Brutos** | `lead_imports.raw_payload` (JSONB) | Payload original da fonte, imutável, para auditoria e re-processamento |
| **Normalizados** | `companies`, `contacts`, `websites`, `social_profiles` | Dados validados, deduplicados, com campos limpos |
| **Derivados** | `website_audits`, `lead_scores`, `ai_analyses` | Saída de ferramentas determinísticas + IA, sempre versionada e rastreável à evidência |

Regra: **nunca sobrescrever o bruto**; normalizados recebem `normalizedAt` e `normalizedBy`; derivados guardam `evidence` JSONB apontando para as entradas usadas.

### 1.4 Normalização e validação

- **Telefone:** normalizar para **E.164** (`+5511912345678`); validar com lib de prefixos BR (DDD × cidade). Guardar flag `is_valid`, `is_mobile`, `is_whatsapp` (a confirmação de WhatsApp *não* vem da origem — será validada por API oficial/consentimento).
- **E-mail:** lowercase, verificação de sintaxe + domínio com MX/DNS; rejeitar domínios descartáveis.
- **Domínio/website:** punycode, strip de `www`/protocolo, verificação DNS + HTTPS; registrar `canonical_domain`.
- **Redes sociais:** normalizar handle (remover `@`, lowercase), validar formato por plataforma; **não** capturar conteúdo do perfil por scraping.
- **Deduplicação:** três níveis, executados no job de ingestão:
  1. **Exata:** `organizationId + phone_e164` UNIQUE; `organizationId + canonical_domain` UNIQUE; `organizationId + externalId` UNIQUE.
  2. **Normalizada:** email normalizado; par `canonical name + city + state`.
  3. **Fuzzy (auxiliar):** extensão `pg_trgm` com similaridade ≥ 0.85 em nome+cidade para sinalizar duplicado suspeito a revisão humana.
  - Resultado por candidato: `new | duplicate_exact | duplicate_suggested | conflict`.
- **Fonte e momento:** cada registro carrega `sourceKey`, `collectedAt` (na origem) e `ingestedAt` (no sistema). A finalidade é gravada por importação.

### 1.5 Modelo PostgreSQL (visão resumida — detalhe completo na seção 3)

O modelo atual `Lead` é substituído por um grafo: `Company` (1) — `Contacts`, `Websites`, `SocialProfiles`, `Scores`, `Analyses`; `Company` (1) — `CampaignLeads` — `Campaigns` — `Messages` — `Conversations`. A tabela `Lead` atual vira **visão/leitura consolidada** (materializada ou query) sobre `Company + Score + Status`.

---

## 2. Arquitetura geral

### 2.1 Recomendação de stack

- **Backend: NestJS (TypeScript) — recomendado.** Justificativa: mesmo idioma do frontend Next.js (tipos compartilhados via pacote `shared/`), integração nativa com Prisma, BullMQ (Redis), modularização por domínio (ingestão, IA, mensagens, webhooks) que permite extrair *workers* sem reescrever; ecossistema maduro para filas, agendamento e observabilidade. FastAPI seria igualmente viável (trocar LLM é transparente), mas duplicaria o idioma e o custo cognitivo do time — trade-off não compensa aqui.
- **Frontend:** Next.js 16 + TypeScript (já é a base atual; mantém-se).
- **Banco:** PostgreSQL 16 (Google Cloud SQL).
- **Filas/agendamento:** Redis + BullMQ (dentro do NestJS). Celery descartado por ser Python.
- **IA:** camada de abstração `AiProvider` com provedores plugáveis (OpenAI/Anthropic/Gemini). Structured output via JSON Schema. Evidência + *prompt injection* tratados (seção 13).
- **Deploy:** Google Cloud (Cloud Run para a API + workers, Cloud SQL, Memorystore Redis, Cloud Storage, Secret Manager, Cloud Logging/Monitoring/Trace, Pub/Sub para webhooks internos, Cloud Scheduler para jobs).
- **Auth:** OAuth (Google Workspace/GitHub) + sessão; RBAC por organização.

### 2.2 Diagrama textual

```
                        ┌─────────────────────────────────────────────┐
                        │  FRONTEND (Next.js + TypeScript)            │
                        │  Dashboard · Leads · Análises · Campanhas   │
                        │  Aprovação · Inbox · Tarefas · Config       │
                        └───────────────┬─────────────────────────────┘
                                        │ REST (NestJS API gateway, /api/v1)
                                        ▼
        ┌───────────────────────────────────────────────────────────────────┐
        │                        NESTJS (módulos)                            │
        │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐          │
        │  │  ingest  │ │  enrich   │ │siteAudit │ │     ai       │          │
        │  └────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬───────┘          │
        │  ┌──────────┐ ┌─────┴──────┐ ┌────┴─────┐ ┌──────┴─────────┐       │
        │  │   crm    │ │ campaigns  │ │messages  │ │    webhooks    │       │
        │  └──────────┘ └────────────┘ └──────────┘ └────────────────┘       │
        └───────┬──────────────┬──────────────────────┬──────────────────────┘
                │              │                      │
        ┌───────▼───────┐ ┌────▼───────┐       ┌──────▼─────────┐
        │   BullMQ      │ │ PostgreSQL │       │  Redis (cache/ │
        │ (Redis) filas │ │  Cloud SQL │       │  rate-limit,   │
        │ + Scheduler   │ │  (Prisma)  │       │  idempotência) │
        └───────┬───────┘ └────┬───────┘       └────────────────┘
                │              │
        ┌───────▼──────────────▼──────────────┐   ┌──────────────────────────┐
        │  WORKERS (Cloud Run jobs / same img) │   │  Meta Cloud API:        │
        │  enrich-worker · audit-worker        │   │  WhatsApp Cloud API     │
        │  ai-worker · send-worker            │   │  Instagram Graph API     │
        │  webhook-worker                      │   │  (não via WhatsApp Web) │
        └──────────────┬──────────────────────┘   └───────────┬──────────────┘
                       │ webhooks entrantes                    │ webhooks de status/
                       ▼                                       │ mensagens/respostas
        ┌─────────────────────────────┐                        ▼
        │  Pub/Sub → webhook-worker → │ ◄──────────────────────┘
        │  idempotência por event id  │
        └─────────────────────────────┘

        Auxiliares: Cloud Storage (anexos, exports), Secret Manager (tokens),
        Cloud Logging/Monitoring/Trace (observabilidade), Cloud Scheduler (jobs).
```

### 2.3 Componentes e responsabilidades

| Serviço | Responsabilidade |
|---|---|
| **Frontend** | UI de revisão humana, aprovação, inbox, campanhas. |
| **API (NestJS)** | Orquestração, RBAC, validação (zod), expõe REST para o frontend. |
| **Ingestão** | Recebe imports de fontes, normaliza, valida, deduplica, persiste bruto+normalizado. |
| **Enriquecimento** | DNS, HTTPS, domínio, telefone, geolocalização, presença de redes. |
| **Auditoria de site** | Fetch, PageSpeed Insights API, HTML/SEO/acessibilidade básica, robots.txt, captura de evidências. |
| **IA** | Análise da empresa, pontuação qualitativa, geração de mensagens, classificação de respostas. |
| **CRM de leads** | Estado, histórico, tarefas, conversas, consentimento, supressão. |
| **Gerenciador de campanhas** | Listas, agendamento, limites, pausa/retomada, regras de frequência. |
| **Fila de tarefas** | BullMQ: jobs assíncronos com retry, DLQ e idempotência. |
| **Mensagens** | Envio via API oficial, tracking de status, re-entrega, opt-out automático. |
| **Webhooks** | Recebimento, verificação de assinatura, deduplicação, roteamento. |
| **Banco / Redis / Storage / Observabilidade** | Persistência, cache/rate-limit/fila, arquivos, logs/métricas/tracing/alertas. |

### 2.4 Fluxo ponta a ponta

```
coleta (fonte) → ingestão (normaliza + valida + dedup) → enriquecimento
→ auditoria de site → análise IA (fatos/inferências/desconhecidos)
→ lead scoring (0-100) → geração de mensagem (3 versões + evidências)
→ fila de aprovação humana (Modo A) OU regras (Modo B, só com base legal)
→ envio via WhatsApp Cloud API / IG Graph API (template aprovado quando exigido)
→ webhook de status (sent/delivered/read) → webhook de resposta
→ classificação IA da resposta (interesse/objeção/sem interesse/opt-out)
→ follow-up dentro de regras (janela/interação) OU transferência para humano
→ atualização de estado, tarefa, histórico, métricas, auditoria
```

---

## 3. Modelo de dados (PostgreSQL / Prisma)

### 3.1 Convenções

- PK `cuid()`; `organizationId` em toda entidade de negócio (multi-org).
- Soft delete via `deletedAt` em entidades mestras (`companies`, `contacts`, `campaigns`, `users`); histórico imutável (`messages`, `webhook_events`, `audit_logs`) **nunca** é apagado — recebe `retentionUntil` para TTL.
- Campos de auditoria: `createdAt`, `updatedAt`, `createdById`, `updatedById`.
- LGPD: `dataOrigin` (fonte), `collectedAt`, `purpose`, `legalBasis`, `consentId`, `suppressedAt`.
- Idempotência: `webhook_events.eventId UNIQUE`; jobs com `jobKey UNIQUE` e status idempotente.

### 3.2 Enumerações (status)

```prisma
enum LeadStatus {
  NOVO            // recém criado, sem pipeline
  IMPORTADO       // veio de fonte, aguardando pipeline
  EM_ANALISE      // enriquecimento + IA em andamento
  AGUARDANDO_REVISAO // análise pronta, aguardando humano
  APROVADO        // revisado e liberado
  PRONTO_PARA_CONTATO
  ENVIADO
  ENTREGUE
  LIDO
  RESPONDEU
  INTERESSADO
  SEM_INTERESSE
  AGUARDANDO_RETORNO
  REUNIAO_MARCADA
  CONVERTIDO
  OPT_OUT
  BLOQUEADO
  ERRO
  ARQUIVADO
}

enum ContactChannel { WHATSAPP, INSTAGRAM, EMAIL, PHONE, LINKEDIN }
enum MessageStatus  { DRAFT, APPROVED, QUEUED, SENDING, SENT, DELIVERED, READ, FAILED, PAUSED, OPT_OUT }
enum CampaignStatus { DRAFT, ACTIVE, PAUSED, COMPLETED, STOPPED, FAILED }
enum ConsentStatus  { NOT_APPLICABLE, GRANTED, DENIED, WITHDRAWN, IMPLIED }
enum LegalBasis     { LEGITIMATE_INTEREST, CONTRACT, CONSENT, PUBLIC_INFO, NO_BASIS }
enum SourceClass    { OFFICIAL_API, LICENSED, PUBLIC, SCRAPED, FIRST_PARTY, USER_PROVIDED }
enum ImportStatus   { PENDING, PROCESSING, COMPLETED, PARTIAL, FAILED }
enum TaskStatus     { OPEN, IN_PROGRESS, DONE, CANCELLED, OVERDUE }
enum WebhookStatus  { RECEIVED, PROCESSED, FAILED, RETRYING, DUPLICATE }
enum WebsiteStatus  { NO_WEBSITE, ACTIVE, UNREACHABLE, PARKED, UNKNOWN }
```

### 3.3 Tabelas (campos principais e índices)

**users**
```prisma
model User {
  id             String   @id @default(cuid())
  organizationId String
  email          String   @unique
  name           String
  role           Role     @default(OPERATOR) // OWNER, ADMIN, OPERATOR, ANALYST, VIEWER
  oauthProvider  String?  @default("google")
  active         Boolean  @default(true)
  lastLoginAt    DateTime?
  deletedAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([organizationId, email])
  @@index([organizationId])
}
```

**companies** (núcleo do lead)
```prisma
model Company {
  id             String       @id @default(cuid())
  organizationId String
  externalId     String?                    // id da origem (ex.: Google Place ID)
  name           String
  nameNormalized String?                    // lowercase, sem acentos/pontuação
  category       String?
  address        String?
  city           String?
  state          String?     @db.Char(2)
  postalCode     String?
  latitude       Float?
  longitude      Float?
  phoneE164      String?                    // primeiro telefone canônico (dedup key)
  canonicalDomain String?                   // website canônico (dedup key)
  rating         Float?
  reviewsCount   Int?
  websiteStatus  WebsiteStatus @default(UNKNOWN)
  status         LeadStatus    @default(NOVO)
  dataOrigin     String                     // sourceKey
  sourceUrl      String?
  collectedAt    DateTime
  legalBasis     LegalBasis    @default(NO_BASIS)
  purpose        String?
  notes          String?
  deletedAt      DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  // relations: contacts, websites, socialProfiles, scores, analyses, campaignLeads, tasks
  @@unique([organizationId, externalId])
  @@unique([organizationId, phoneE164])
  @@unique([organizationId, canonicalDomain])
  @@index([organizationId, status])
  @@index([organizationId, city, state])
  @@index([organizationId, nameNormalized])
}
```

**contacts**
```prisma
model Contact {
  id             String         @id @default(cuid())
  organizationId String
  companyId      String
  type           ContactChannel // phone | email | instagram | linkedin | whatsapp
  value          String         // E.164 / email lowercase / handle
  valueNormalized String
  isPrimary      Boolean        @default(false)
  isValid        Boolean        @default(false)
  isVerified     Boolean        @default(false) // verificado por API oficial/consentimento
  verifiedAt     DateTime?
  sourceKey      String
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  deletedAt      DateTime?
  @@unique([organizationId, type, valueNormalized])
  @@index([companyId])
  @@index([organizationId, isValid, isVerified])
}
```

**lead_sources**
```prisma
model LeadSource {
  id          String      @id @default(cuid())
  organizationId String
  key         String      // google_maps_playwright, google_places_api, form, referral, instagram_api...
  name        String
  class       SourceClass // OFFICIAL_API | LICENSED | PUBLIC | SCRAPED | FIRST_PARTY | USER_PROVIDED
  enabled     Boolean     @default(true)
  requiresConsent Boolean  @default(false)
  allowedFields String[]  // quais campos esta fonte pode preencher
  config      Json?
  deletedAt   DateTime?
  @@unique([organizationId, key])
}
```

**lead_imports** (bruto + auditoria da coleta)
```prisma
model LeadImport {
  id             String       @id @default(cuid())
  organizationId String
  sourceKey      String
  externalId     String?
  companyName    String
  rawPayload     Json         // payload bruto da origem, imutável
  collectedAt    DateTime     // na origem
  ingestedAt     DateTime     @default(now())
  purpose        String?
  dedupResult    DedupResult? // NEW | DUPLICATE_EXACT | DUPLICATE_SUGGESTED | CONFLICT
  dedupReason    String?
  matchedCompanyId String?
  status         ImportStatus @default(PENDING)
  error          String?
  @@index([organizationId, sourceKey, collectedAt])
  @@index([organizationId, matchedCompanyId])
}
```

**websites**
```prisma
model Website {
  id             String      @id @default(cuid())
  organizationId String
  companyId      String
  url            String      // canônico com protocolo
  domain         String      // sem protocolo/www
  status         WebsiteStatus @default(UNKNOWN)
  lastFetchedAt  DateTime?
  httpStatus     Int?
  isHttps        Boolean?
  tlsValid       Boolean?
  hasRobots      Boolean?
  redirectTo     String?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  deletedAt      DateTime?
  @@unique([organizationId, domain])
  @@index([companyId])
}
```

**website_audits** (resultado técnico determinístico)
```prisma
model WebsiteAudit {
  id             String      @id @default(cuid())
  organizationId String
  websiteId      String
  tool           String      // "pagespeed_api" | "lighthouse" | "html_scan" | "dns_check" ...
  auditedAt      DateTime    @default(now())
  metrics        Json        // { fcp, lcp, tbt, cls, mobile_friendly, ... }
  checks         Json        // { https, tls, robots, contact_btn, forms, cta, seo_title, ... }
  errors         String[]
  raw            Json?
  @@index([websiteId])
  @@index([organizationId, auditedAt])
}
```

**social_profiles**
```prisma
model SocialProfile {
  id             String      @id @default(cuid())
  organizationId String
  companyId      String
  platform       SocialPlatform // INSTAGRAM | LINKEDIN | FACEBOOK | OTHER
  handle         String
  url            String?
  discoveredAt   DateTime    @default(now())
  isOfficial     Boolean?    // se confirmado pelo próprio lead
  verifiedBy     String?     // sourceKey ou userId
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  deletedAt      DateTime?
  @@unique([organizationId, platform, handle])
  @@index([companyId])
}
```

**lead_scores** (score 0-100, versionado)
```prisma
model LeadScore {
  id             String   @id @default(cuid())
  organizationId String
  companyId      String
  score          Int      // 0-100
  tier           ScoreTier // HIGH 80-100 | MEDIUM 60-79 | NURTURE 40-59 | LOW 0-39
  components     Json     // peso e valor de cada fator
  calculatedAt   DateTime @default(now())
  calculatedBy   String   // "engine_v1" | "ai_v1"
  rationale      String?
  @@index([companyId])
  @@index([organizationId, score])
}
```

**ai_analyses** (saída da IA com evidências)
```prisma
model AiAnalysis {
  id             String   @id @default(cuid())
  organizationId String
  companyId      String
  model          String   // "openai:gpt-4o", "gemini-1.5-pro", ...
  promptVersion  String
  inputSnapshot  Json     // o que foi enviado ao LLM (sem PII desnecessário)
  output         Json     // JSON estruturado (company_summary, segment, opportunities, ...)
  facts          Json     // observações baseadas em evidência
  inferences     Json     // suposições marcadas como tal
  unknowns       Json     // campos não determinados
  status         AnalysisStatus @default(COMPLETED) // COMPLETED | PARTIAL | NEEDS_HUMAN_REVIEW | FAILED
  createdAt      DateTime @default(now())
  @@index([companyId])
  @@index([organizationId, status])
}
```

**campaigns** / **campaign_leads**
```prisma
model Campaign {
  id             String         @id @default(cuid())
  organizationId String
  name           String
  channel        ContactChannel @default(WHATSAPP)
  status         CampaignStatus @default(DRAFT)
  mode           CampaignMode   @default(ASSISTED) // ASSISTED | AUTOMATED
  templateId     String?        // template aprovado quando exigido
  scheduleStart  DateTime?
  scheduleEnd    DateTime?
  allowedHours   Json           // { start: "09:00", end: "18:00", tz: "America/Sao_Paulo" }
  dailyCap       Int            @default(30)   // máx. envios/dia
  dailySent      Int            @default(0)
  pausedReason   String?
  minScore       Int            @default(60)
  requireConsent Boolean        @default(true)
  createdById    String?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  deletedAt      DateTime?
  @@index([organizationId, status])
}

model CampaignLead {
  id             String     @id @default(cuid())
  campaignId     String
  companyId      String
  status         MessageStatus @default(DRAFT)
  approvedById   String?
  approvedAt     DateTime?
  scheduledFor   DateTime?
  sentAt         DateTime?
  deliveredAt    DateTime?
  readAt         DateTime?
  repliedAt      DateTime?
  messageId      String?   // id da mensagem oficial
  lastError      String?
  retryCount     Int       @default(0)
  optOutAt       DateTime?
  @@unique([campaignId, companyId])
  @@index([companyId])
  @@index([campaignId, status])
}
```

**message_templates**
```prisma
model MessageTemplate {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  channel        ContactChannel @default(WHATSAPP)
  externalId     String?  // id do template na Cloud API
  status         TemplateStatus @default(DRAFT) // DRAFT | SUBMITTED | APPROVED | REJECTED | PAUSED
  body           String
  variables      String[]
  language       String   @default("pt_BR")
  category       String?  // MARKETING | UTILITY | AUTHENTICATION
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?
  @@unique([organizationId, name])
}
```

**messages** (cada tentativa de envio, imutável, auditável)
```prisma
model Message {
  id             String          @id @default(cuid())
  organizationId String
  companyId      String
  campaignLeadId String?
  channel        ContactChannel  @default(WHATSAPP)
  status         MessageStatus   @default(DRAFT)
  direction      MessageDirection @default(OUTBOUND) // OUTBOUND | INBOUND
  content        String
  contentHash    String          // para detectar mensagens idênticas em massa
  externalMessageId String?      @unique // id da plataforma (idempotência de webhook)
  externalStatus String?
  sentAt         DateTime?
  deliveredAt    DateTime?
  readAt         DateTime?
  errorCode      String?
  errorDetail    String?
  templateId     String?
  provider       String          // "whatsapp_cloud" | "instagram_graph" | ...
  providerConfig Json?
  approvedById   String?
  approvedAt     DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  @@index([companyId])
  @@index([campaignLeadId])
  @@index([organizationId, channel, status])
}
```

**conversations** (histórico da conversa)
```prisma
model Conversation {
  id             String   @id @default(cuid())
  organizationId String
  companyId      String
  channel        ContactChannel @default(WHATSAPP)
  externalThreadId String?
  status         ConversationStatus @default(OPEN) // OPEN | PENDING | RESOLVED | TRANSFERRED | BLOCKED
  lastMessageAt  DateTime?
  assignedToId   String? // humano
  aiSuggestedLabel String? // classificação IA
  aiSuggestedLabelConfidence Float?
  optOutAt       DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([companyId])
  @@index([organizationId, status, assignedToId])
}
```

**consent_records** (base legal e prova de opt-in)
```prisma
model ConsentRecord {
  id             String        @id @default(cuid())
  organizationId String
  companyId      String
  contactId      String?
  channel        ContactChannel
  status         ConsentStatus @default(NOT_APPLICABLE)
  legalBasis     LegalBasis
  proof          Json?         // timestamp, origem do consentimento, id da interação
  sourceKey      String
  grantedAt      DateTime?
  withdrawnAt    DateTime?
  createdAt      DateTime      @default(now())
  @@unique([organizationId, companyId, channel])
  @@index([companyId])
}
```

**suppression_list** (opt-out/oposição, bloqueio global)
```prisma
model SuppressionList {
  id             String   @id @default(cuid())
  organizationId String
  companyId      String?
  contact        String?  // telefone E.164 / email / handle
  channel        ContactChannel
  reason         String   // OPT_OUT | COMPLAINT | BLOCKED | SPAM | NO_BASIS
  sourceKey      String
  createdAt      DateTime @default(now())
  expiresAt      DateTime?
  note           String?
  @@index([organizationId, contact])
  @@index([companyId])
}
```

**tasks** (follow-up, agendamento, revisão)
```prisma
model Task {
  id             String     @id @default(cuid())
  organizationId String
  companyId      String?
  assigneeId     String?
  type           TaskType   // REVIEW_APPROVAL | FOLLOW_UP | RESPONSE_TRIAGE | SITE_RECHECK | DATA_FIX
  status         TaskStatus @default(OPEN)
  dueAt          DateTime?
  completedAt    DateTime?
  payload        Json?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  @@index([organizationId, status, assigneeId])
  @@index([companyId])
}
```

**audit_logs** (rastreabilidade total)
```prisma
model AuditLog {
  id             String   @id @default(cuid())
  organizationId String
  actorId        String?
  actorType      String   // user | system | worker | webhook
  action         String   // company.created, message.sent, optout.registered, campaign.paused...
  entityType     String
  entityId       String?
  before         Json?
  after          Json?
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime @default(now())
  @@index([organizationId, entityType, entityId])
  @@index([organizationId, action, createdAt])
}
```

**webhook_events** (idempotência)
```prisma
model WebhookEvent {
  id             String        @id @default(cuid())
  organizationId String
  provider       String        // whatsapp_cloud | instagram_graph
  eventId        String        @unique // idempotência
  eventType      String        // message.status | message.received | template.quality ...
  payload        Json
  status         WebhookStatus @default(RECEIVED)
  attempts       Int           @default(0)
  lastError      String?
  processedAt    DateTime?
  createdAt      DateTime      @default(now())
  @@index([organizationId, eventType, status])
  @@index([provider, eventId])
}
```

**Observações de modelagem**
- `canonicalDomain` e `phoneE164` UNIQUE por organização: garantem a regra "o mesmo lead não pode ser importado duas vezes".
- `contentHash` em `Message` + job de varredura: bloqueia mensagens idênticas em massa.
- Migração: o `Lead` atual vira migração de dados → `Company` com `status` mapeado (`NOVO→NOVO`, `CONTATADO→ENVIADO`, etc.), `source="legacy_import"`, `legalBasis=NO_BASIS` (não elegível a envio automático).

---

## 4. Análise automática do lead (pipeline IA + determinístico)

### 4.1 Etapas

1. **Enriquecimento determinístico** (`enrich-worker`): DNS/HTTPS/TLS, PageSpeed Insights API (mobile), fetch de HTML (com timeout, tamanho e User-Agent controlado), `robots.txt`, contato/CTA/catálogo/formulário/checkout via heurísticas de DOM, presença de redes sociais (só a partir de fonte autorizada).
2. **Análise IA** (`ai-worker`): recebe o *resumo* enriquecido + evidências e produz o JSON estruturado (seção 4.3), separando **fatos**, **inferências** e **desconhecidos**.
3. **Validação e separação:** nada que a IA afirma sem evidência entra como fato. Campos sem suporte → `unknowns` → refletem no score como "risco de dados insuficientes".
4. **Casos duvidosos** → status `NEEDS_HUMAN_REVIEW` e tarefa de revisão.

### 4.2 Ferramentas sugeridas (respeitando limites e permissões)

| Check | Ferramenta | Observação |
|---|---|---|
| Performance mobile | **PageSpeed Insights API** (Lighthouse) | Respeitar quota; rodar no worker; cachear por domínio+versão |
| HTTPS/TLS | `fetch` + verificação de certificado | Simples e gratuito |
| DNS | DNS resolution (não-scraping) | Verifica existência de domínio |
| robots.txt | fetch de `/robots.txt` | Apenas para política de acesso; não fazer scraping agressivo |
| HTML | Fetch com limite de tamanho (ex.: 2 MB), timeout 10 s, UA padrão | Nunca seguir redirecionamentos infinitos |
| SEO básico | Parsing de `title`, `meta description`, `og:`, `h1`, alt vazios | Heurística, não métrica definitiva |
| Acessibilidade básica | Heurística DOM (alt, labels, contraste via contraste de texto) | Marcar como "suspeito", não como laudo |
| CTA/contato/catálogo | Heurística DOM (âncoras com WhatsApp/tel/, formulários, "agendar", "carrinho") | Inferência de presença, não de intenção |

**Regras anti-falso-positivo:** site **inacessível ≠ inexistente**. `UNREACHABLE` (timeout/5xx/SSL) é separado de `NO_WEBSITE` (nenhum domínio encontrado) e de `PARKED` (domínio registrado sem conteúdo). Nunca inferir "lentidão" sem métrica do Lighthouse; nunca afirmar "perdendo vendas" sem dado de conversão.

### 4.3 Formato JSON estruturado da análise

```jsonc
{
  "company_summary": "Oficina mecânica em São Paulo, SP, com 4.6★ (132 avaliações) e site ativo.",
  "business_segment": "Oficina mecânica / manutenção automotiva",
  "target_fit": { "score": 85, "reason": "Segmento atendido pela Aurora: precisa de presença digital e automação de agendamento." },
  "website_status": "active",
  "website_quality": {
    "score": 42,
    "evidence": ["PageSpeed mobile FCP 3.8s (classe 'poor')", "meta description ausente", "sem botão de WhatsApp no topo"],
    "critical_issues": ["LCP > 4s no mobile"],
    "minor_issues": ["meta description ausente", "title genérico"],
    "unknowns": ["Não foi possível verificar checkout", "sem dados de conversão"]
  },
  "business_opportunities": [
    { "service": "Landing page de agendamento", "reason": "Site não oferece agendamento online e a categoria se beneficia disso.", "confidence": "medium" },
    { "service": "Integração WhatsApp no site", "reason": "Contato depende de telefone; botão de WhatsApp facilitaria conversão.", "confidence": "high" }
  ],
  "recommended_approach": "Abordagem assistida: revisar e personalizar draft; primeiro contato via WhatsApp Business com template aprovado.",
  "lead_score": 82,
  "contact_recommendation": "eligible_for_official_flow",
  "personalization_points": ["Empresa ativa no Google Maps com boa avaliação", "Site ativo, sem agendamento online"],
  "risks": ["Sem consentimento prévio registrado: enviar apenas via template aprovado", "Avaliações são de fonte pública; não usar como elogio sem licença"],
  "suggested_message": "Olá! Vi que a Mecânica Silva atende em São Paulo e tem boa avaliação no Google. Sou da Aurora Code Tech e ajudo oficinas a receber agendamentos pelo WhatsApp e a modernizar o site. Gostaria de mostrar como funciona? Se não for prioridade agora, sem problema.",
  "message_reasoning": "Usa fatos verificáveis (localização, avaliação do Google, presença de site), oferta específica (agendamento via WhatsApp), uma única pergunta e saída educada."
}
```

Campos derivados da IA são sempre acompanhados de `evidence` ou marcados como `unknowns`/`inferences` — o frontend exibe o triângulo de confiança (Fato / Inferência / Desconhecido).

---

## 5. Sistema de pontuação (0–100)

### 5.1 Fatores e pesos (configuráveis)

| Fator | Peso | Critério de pontuação (default) |
|---|---|---|
| Aderência ao público-alvo | 25 | Categoria ∈ alvo (serviços, lojas, restaurantes, clínicas, oficinas, etc.) |
| Ausência de site ou site problemático | 15 | `NO_WEBSITE`=máx; `active+crítico`=alto; `active+bom`=baixo; `UNREACHABLE`=médio |
| Potencial de investimento (tamanho aparente) | 10 | Inferido por estrutura (avaliações, cidade, porte do site) |
| Facilidade de contato | 10 | WhatsApp/telefone validado e verificado; mais contatos = maior |
| Presença de WhatsApp comercial | 5 | Confirmação por API/consentimento (nunca por scraping) |
| Necessidade aparente | 15 | Sinais de gaps (sem agendamento, sem CTA, conteúdo desatualizado) |
| Localização | 5 | Cidade atendida pelo escopo da Aurora |
| Qualidade/confiabilidade dos dados | 5 | Campos validados (telefone E.164, domínio HTTPS, geolocalização) |
| Consentimento/interação prévia | 5 | Interação real registrada (inbound, form, indicação) |
| Risco de abordagem inadequada (penalidade) | -5 | Segmento sensível, sem base legal, sinais de saturação |

### 5.2 Faixas

| Faixa | Classificação | Ação recomendada |
|---|---|---|
| 80–100 | **Alta prioridade** | Análise completa, geração de mensagem, aprovação humana prioritária |
| 60–79 | **Prioridade média** | Mesma fila, menos urgente |
| 40–59 | **Nutrição / revisão** | Não entrar em fila de envio; alimentar nutrição; revisar dados |
| 0–39 | **Não abordar** | Arquivar ou aguardar interação inbound |

### 5.3 Por que o score nunca dispara envio sozinho

O score **classifica**, não autoriza. O envio exige **condições independentes**: (a) base legal/consentimento/interação compatível com a política da plataforma; (b) template aprovado quando exigido; (c) aprovação humana no Modo A; (d) regras de frequência/horário; (e) ausência na lista de supressão. Um lead de 95 pode ser *do_not_contact* por ausência de base; um de 55 com interação inbound real pode ser elegível. Score e elegibilidade são **eixos ortogonais** e aparecem separados na UI.

---

## 6. Personalização de mensagens

### 6.1 Prompt interno (system prompt) para geração

```
Você é um redator comercial B2B sênior da Aurora Code Tech, que cria sites,
landing pages, lojas virtuais, sistemas sob medida, integrações de pagamento
e automações para pequenas e médias empresas no Brasil.

Tarefa: gerar até 3 versões de mensagem de primeiro contato (curta ≤300 chars,
média ≤450 chars, longa ≤600 chars) para a empresa descrita na análise.

REGRAS OBRIGATÓRIAS:
1. Idioma: português brasileiro. Tom: profissional, direto, cordial.
2. Use SOMENTE fatos verificáveis da análise (evidence/personalization_points).
   NUNCA invente nome de pessoa, métricas, problemas ou elogios não comprovados.
3. NÃO diga "erro" se não comprovado; NÃO prometa aumento de vendas/resultados;
   NÃO use "tenho a solução perfeita"; NÃO use linguagem agressiva ou urgência falsa.
4. Deixe claro que é uma abordagem comercial da Aurora Code Tech.
5. Inclua saída educada, ex.: "Se não for prioridade agora, sem problema."
6. Faça UMA única pergunta ou chamada para ação.
7. Máximo de 1 emoji por mensagem; emojis apenas se naturais ao contexto.
8. A mensagem deve parecer escrita para AQUELA empresa (use a observação
   específica verificável dela).
9. Se as evidências forem insuficientes, retorne status manual_review e
   NÃO gere mensagens.

FORMATO DE SAÍDA (JSON estrito):
{
  "status": "ready|manual_review",
  "messages": [
    { "length": "short", "text": "...", "personalization_evidence": ["..."] }
  ]
}
```

### 6.2 Variações por cenário

| Cenário | Diretriz específica |
|---|---|
| Sem site | Focar em criar presença digital; não dizer "seu concorrente tem site melhor" |
| Site com problema de conversão (evidência) | Focar em conversão (CTA, WhatsApp, agendamento) citando a evidência |
| Site lento/não responsivo (Lighthouse) | Mencionar a métrica como observação, ex.: "notei que o site demora a carregar no celular" |
| Presença digital desatualizada | Falar de atualização sem criticar |
| Loja que poderia vender online | Focar em loja virtual/integração de pagamento |
| Processo manual aparente | Focar em automação de processos (agendamento, orçamento) |
| Interagiu no Instagram | Referenciar a interação real (comentário/story) — só com permissão |
| Solicitou contato | Tom mais direto, sem pedir permissão duas vezes |

### 6.3 Regras de bloqueio (guardrails aplicados no código, fora do LLM)

- `contentHash` idêntico → bloquear/rotular (detecta mensagens iguais em massa).
- Regex de emojis: >2 → bloquear.
- Frases banidas: "urgente", "só hoje", "oferta por tempo limitado", "perfeito para você", "não perca".
- Contato em `suppression_list` → nunca gerar nem enviar.
- Mesma empresa contatada há < X dias sem resposta → bloquear nova abordagem.
- Validação pós-geração: a mensagem **deve** conter ≥1 token da `personalization_evidence`; caso contrário → `manual_review`.

### 6.4 Exemplo de saída (com dados sintéticos de demonstração)

> *Evidência usada (demonstração): site ativo com FCP mobile 3.8s; sem agendamento online; boa avaliação no Google; telefone/WhatsApp validados. Consentimento: nenhum → só Modo A.*

```jsonc
{
  "status": "ready",
  "messages": [
    {
      "length": "short",
      "text": "Olá, Mecânica Silva! Sou da Aurora Code Tech, que cria sites e automações para oficinas. Vi que o site ainda não tem agendamento online. Posso te mostrar como o WhatsApp pode agendar visitas? Se não for prioridade, tudo bem.",
      "personalization_evidence": ["Site ativo sem agendamento online", "Segmento: oficina mecânica"]
    },
    {
      "length": "medium",
      "text": "Olá! Sou da Aurora Code Tech, empresa que cria sites e automações para pequenos negócios. Vi que a Mecânica Silva tem boa avaliação no Google e site ativo, mas ainda sem agendamento online — que costuma gerar mais visitas com menos telefonemas. Gostaria que eu te mostrasse uma forma simples de o cliente agendar direto pelo WhatsApp? Se não for prioridade agora, sem problema.",
      "personalization_evidence": ["Avaliação 4.6 no Google (fonte pública)", "Site ativo sem agendamento", "WhatsApp validado"]
    },
    {
      "length": "long",
      "text": "Olá, equipe da Mecânica Silva! Me chamo [Nome], da Aurora Code Tech — criamos sites, landing pages e automações para empresas como a de vocês. Notei no site de vocês que o contato é feito por telefone e que ainda não há agendamento online; além disso, a página demora a carregar no celular (cerca de 4s). Costumo ver esse padrão em oficinas que perdem visitas porque o cliente não consegue agendar com rapidez. Posso te mostrar uma solução simples de agendamento integrado ao WhatsApp? Se não for uma prioridade, sem problema — agradeço a atenção.",
      "personalization_evidence": ["FCP mobile ~3.8s (Lighthouse)", "Site sem agendamento online", "Contato via telefone apenas"]
    }
  ]
}
```

> O `[Nome]` é preenchido pelo operador na revisão (o sistema nunca inventa nome).

---

## 7. Automação de contato (dois modos + máquina de estados)

### 7.1 Modo A — Assistido por humano (default)

```
IA pesquisa e analisa → IA gera 3 versões + evidências → operador revisa/edita
→ operador aprova → sistema envia pela API oficial (template aprovado quando exigido)
→ webhook de status → resposta → IA classifica (interesse/objeção/sem interesse/opt-out)
→ operador assume conversa quando necessário
```
- Envio sempre pós-aprovação humana, individual ou em lote revisado.
- A IA só sugere; toda decisão de envio tem `approvedById` e `approvedAt`.

### 7.2 Modo B — Automatizado com regras (restrito)

Permitido **somente** quando existir **base compatível**: opt-in registrado (formulário, interação inbound, solicitação de contato) ou interação prévia dentro da política (ex.: cliente chamou primeiro; comentário seguido de resposta autorizada).

Regras obrigatórias do Motor de Regras:
- **Template aprovado** quando a política exigir (nunca free-form para cold outreach).
- **Limites:** `dailyCap` por campanha, fila com espaçamento aleatório controlado, `allowedHours` (ex.: 09:00–18:00, fuso SP), nunca em fins de semana por default.
- **Pausa automática** (kill-switch) ao detectar: reclamação, opt-out, taxa de erro > limite (ex.: 10%), qualidade do template rebaixada pela Meta, aumento de bloqueios, ou sinal de baixa resposta.
- **Opt-out imediato:** palavra-chave/sinal → registra `suppression_list`, marca `OPT_OUT`, envia resposta padrão de confirmação, **nunca** follow-up.
- **Transferência para humano:** reação de interesse, pergunta complexa, objeção, ou resposta ambígua (>0.5 confiança abaixo do limiar).
- **Histerese/frequência:** mesma empresa não é reabordada se não respondeu (default: esperar resposta; follow-up só se houver interação).

### 7.3 Máquina de estados do lead

```
[ Novo ] → [ Importado ] → [ Em análise ] → [ Aguardando revisão ] → [ Aprovado ]
→ [ Pronto para contato ] → [ Enviado ] → [ Entregue ] → [ Lido ] → [ Respondeu ]
→ ( [ Interessado ] → [ Reunião marcada ] → [ Convertido ] )
→ ( [ Sem interesse ] → [ Arquivado ] )
→ ( [ Aguardando retorno ] → loop follow-up dentro de regras )
→ ( [ Opt-out ] → terminal, nunca mais contato )
→ ( [ Bloqueado ] → terminal, violação/risco )
→ ( [ Erro ] → retry com backoff, não perde estado )
→ [ Arquivado ]
```
Transições restritas por papel: `APROVAR` = ADMIN/OPERATOR; `PAUSAR_CAMPANHA` = ADMIN/OWNER; `ALTERAR_DADOS` = ADMIN. Toda transição vira `audit_logs`.

---

## 8. Integração WhatsApp (WhatsApp Business Platform / BSP oficial)

### 8.1 Configuração

1. **Conta:** WhatsApp Business App (Meta) → número dedicado para a Aurora. **Cloud API** direta (autogerenciada) ou **BSP** (Twilio/Zenvia/Gupshup) — BSP reduz custo operacional de escalar múltiplos números e oferece suporte de homologação de templates.
2. **Tokens:** `WABA_ID`, `PHONE_NUMBER_ID`, `ACCESS_TOKEN` (long-lived via System User, permissão mínima) armazenados no **Secret Manager**; rotacionados periodicamente. Nenhum token em código, `.env` de build, ou logs.
3. **Webhooks:** URL configurada na Meta com **verify token**; Meta chama `GET` (verificação de assinatura `X-Hub-Signature-256`) e `POST` para eventos.
4. **Templates:** criação/submissão via API; status `SUBMITTED → APPROVED/REJECTED/PAUSED`. Templates com **variáveis** e **exemplos válidos** para evitar rejeição por qualidade.

### 8.2 Fluxo de envio

- `POST /{phone_number_id}/messages` com `{ type: "text"|"template", to, messaging_product: "whatsapp", template: { name, language, components } }`.
- **Janela de 24 h:** dentro dela (após resposta do cliente) permite mensagens livres; fora dela, **somente templates aprovados**. O sistema controla a janela por conversa e escolhe o tipo de mensagem automaticamente.
- **Status:** webhooks `sent`, `delivered`, `read`, `failed` (com `errors[].code`) → atualizam `messages` e `campaign_leads`.
- **Respostas:** webhook `messages` (inbound) → cria `conversation`, roteia para IA de classificação e/ou operador.

### 8.3 Tratamento de erros

- `131026` (número não registrado) → marca contato inválido, remove da fila.
- `131047` (não aceita mensagens) → marca `BLOCKED`.
- Rate limit (HTTP 429) → backoff exponencial + Jitter; o envio nunca é perdido (estado `QUEUED`).
- `failed` definitivo → lead volta a `PRONTO_PARA_CONTATO` com flag de erro (estado preservado), job entra na DLQ para triagem.

### 8.4 Governança de envio

- **Frequência:** caps por número, por campanha, por dia; espaçamento com jitter (ex.: 30–90 s).
- **Opt-in:** registrado em `consent_records` com prova (origem, timestamp, id de interação). Cold outreach → obrigatório template aprovado + base legal.
- **Opt-out:** palavra-chave/sinal na resposta → supressão imediata + confirmação + fim do contato.
- **Suppression list:** consultada em tempo real no envio e na geração (dupla barreira).
- **Auditoria:** todo envio/status/erro em `messages`, `audit_logs`, `webhook_events`.
- **Interromper imediatamente:** botão "Pausar" chama `campaign.status = PAUSED` + **flag em Redis** (`campaign:pause:{id}`) checada pelo `send-worker` a cada item — pausa efetiva < 1 s mesmo com fila cheia.

---

## 9. Integração Instagram (Instagram Graph API)

### 9.1 O que é permitido pela API oficial

| Funcionalidade | Status |
|---|---|
| Resposta a **mensagens recebidas** (DM) — usuário iniciou | **Permitido** (Messaging API, token `instagram_manage_messages`) |
| Resposta a **comentários** em posts | **Permitido** (`instagram_manage_comments`) |
| Resposta a **menções/stories** (reply to mention, reply to story) | **Permitido** com escopos próprios |
| Obter dados públicos básicos da própria conta | **Permitido** |
| Enviar **cold DM em massa** para quem nunca interagiu | **Proibido** pela política (não há API oficial para isso) |
| Scraping de perfis com navegador automatizado | **Proibido** (e fora do escopo deste projeto) |

**Condicionais:** app de negócios precisa de **review da Meta** (permissões `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_show_list`, `business_management`) e **Conta Business/Creator** conectada a uma **Página do Facebook**.

### 9.2 Fluxo

```
OAuth → token de acesso de longa duração (System User) → webhooks em
Instagram (messages, comments, mentions) → verificação de assinatura
→ webhook-worker idempotente → classificação IA → resposta oficial
(apenas a interações iniciadas pelo usuário) → humano quando necessário
```

### 9.3 Alternativas compatíveis para prospecção fria

1. **Conteúdo segmentado** (posts/reels) + CTA → inbound.
2. **Anúncios** para públicos adequados (lookalike de clientes atuais).
3. **Formulários de interesse** (lead ads / landing page).
4. **Convite para iniciar conversa** ("click to WhatsApp") — o clique é o opt-in.
5. **Pesquisa manual** com geração de *draft* para revisão (sem envio automático).
6. **Parcerias e indicações** (referral program).

---

## 10. Outras fontes de leads (legal e tecnicamente viáveis)

| Fonte | Dados disponíveis | Integração | Custo | Risco de bloqueio | Consentimento | Armazenamento | Qualidade | Melhor uso |
|---|---|---|---|---|---|---|---|---|
| **Google Places API** (oficial, recomendada no lugar do scraping) | Nome, telefone, site, endereço, rating agregado (com licença), place ID | REST oficial + Place ID p/ dedup | Baixo/por chamada | Baixo (TOS respeitado) | N/A (público) — sujeito a política da plataforma p/ contato | Público (não armazenar conteúdo protegido) | Alta | Lista inicial, enriquecimento |
| **Google Maps Playwright (atual)** | Idem | Importador atual | Baixo | **Alto (TOS)** — sinalizado | N/A | Restrito: sem avaliações/imagens; registrar origem+data | Média | Legado até migrar para Places API |
| **Formulário próprio** | Nome, e-mail, telefone, WhatsApp, cidade, interesse | POST `leads/import` + `consent_records` | Baixo | N/A | **Opt-in explícito (highest)** | Completo | Muito alta | Qualificação inbound |
| **Landing pages** | Idem + origem/UTM | Webhook/API | Médio | N/A | Opt-in por aceite | Completo | Muito alta | Campanhas pagas/orgânicas |
| **Indicações** | Nome, contato, contexto da indicação | Form + manual | Baixo | N/A | Interesse implícito + confirmação | Completo | Alta | Alta prioridade (interação prévia) |
| **LinkedIn** | Perfil público (somente via API oficial / dados públicos básicos) | **Sales Solutions/Campaign Manager via API oficial**; nunca scraping | Alto (licença) | Médio | Seguir políticas; mensagens via InMail oficial | Limitado por TOS | Alta | ABM de médio/grande porte |
| **Diretórios/bases licenciadas** | Varia | Import/API | Médio | Baixo | Exigir prova de base legal na compra | Limitado pelo contrato | Média | Expansão de volume |
| **Dados fornecidos pelo prospecto** | Formulários, e-mails, planilhas | Import | Baixo | N/A | Opt-in registrado | Completo | Muito alta | Base "owned" |
| **Eventos/networking** | Cartões, notas | Form/import manual | Médio | N/A | Confirmar interesse pós-evento | Completo | Alta | Relacionamento |
| **CRM existente** | Histórico completo | API/import | Variável | Baixo | Revisar base legal de cada registro | Completo | Alta | Migração de pipeline |
| **Campanhas de anúncios** | Leads ads, cliques | Meta/Google Ads API → webhook | Alto | Baixo | Opt-in por formulário | Completo | Alta | Inbound em escala |
| **Conteúdo/SEO** | Inbound | Analytics→form/CRM | Médio | Baixo | Opt-in | Completo | Alta | Nutrição |
| **Comentários/mensagens no Instagram** | Interações reais | IG Graph API | Médio | Baixo | **Interação prévia = base** | Completo (regras Meta) | Alta | First-party warm |

Regras comuns: cada fonte cadastrada em `lead_sources` com `class`, `allowedFields`, `requiresConsent`; o pipeline grava `collectedAt`, `purpose` e bloqueia campos que a fonte não pode preencher. **Não** comprar listas sem comprovação de base legal.

---

## 11. Interface do sistema

| Tela | Objetivo | Campos/Filtros | Ações | Permissões | Alertas/Empty/Erro |
|---|---|---|---|---|---|
| **Dashboard** | KPIs comerciais | Período, canal, campanha | Drill-down | VIEWER+ | Empty: CTA "importar leads" |
| **Importação** | Subir/validar imports | Arquivo, fonte, propósito | Pré-visualizar, validar, confirmar | OPERATOR+ | Erro: linha inválida → relatório |
| **Lista de leads** | Gerenciar pipeline | Status, score, faixa, cidade, categoria, fonte | Filtrar, ordenar, batch, exportar | OPERATOR+ | Empty: mensagem de boas-vindas |
| **Detalhes do lead** | Visão consolidada | Dados, contatos, site, redes | Editar, validar, marcar status | OPERATOR+ | Badge de confiança (Fato/Inferência/Desconhecido) |
| **Análise de IA** | Ver análise completa | Modelo, versão do prompt | Re-analisar, pedir revisão humana | ANALYST+ | Alerta quando `NEEDS_HUMAN_REVIEW` |
| **Auditoria do site** | Evidências técnicas | Métricas, checks, tool | Re-auditar | ANALYST+ | Separa `UNREACHABLE` de `NO_WEBSITE` |
| **Fila de aprovação** | Revisar mensagens | Score, prioridade | Aprovar, editar, rejeitar (com motivo) | OPERATOR+ | Alerta de mensagens idênticas |
| **Editor de mensagem** | Personalizar draft | 3 versões, evidências | Escolher, editar, salvar, aprovar | OPERATOR+ | Valida comprimento (≤600) e 1 pergunta |
| **Campanhas** | Criar/gerenciar | Modo, canal, template, limite, horário | Criar, pausar (imediato), retomar, duplicar | ADMIN+ | Alerta de pausa automática (motivo) |
| **Caixa de entrada** | Conversas | Canal, status, atribuído | Responder, transferir, classificar | OPERATOR+ | Badge de sugestão IA + confiança |
| **Tarefas/follow-ups** | Agenda do operador | Tipo, status, due | Concluir, repriorizar | OPERATOR+ | Overdue em destaque |
| **Relatórios** | Métricas (seção 14) | Período, segmento, campanha | Exportar | ANALYST+ | Comparativo por versão de mensagem |
| **Configurações** | Orgs, usuários, fontes, provedores IA, pesos de score | — | CRUD, testes de conexão | OWNER/ADMIN | Teste de token sem expor valor |
| **Consentimentos/supressão** | LGPD | Canal, motivo | Registrar, exportar prova | ADMIN+ | Não permite exclusão acidental de opt-out |
| **Logs e auditoria** | Rastreabilidade | Ação, ator, entidade | Filtrar, exportar | ADMIN | Sem dados sensíveis |

---

## 12. API (REST, prefixo `/api/v1`)

Autorização: `Authorization: Bearer <JWT>`; multitenancy implícita pelo token (`organizationId`). Validação com zod; respostas padronizadas `{ data } | { error }`.

| Endpoint | Método | Exemplo request → response |
|---|---|---|
| `POST /leads/import` | Importar em lote | `[{...contrato seção 1.2}]` → `{ imported: 2, duplicates: 1, suggested: 1 }` |
| `GET /leads` | Listar/filtrar | `?status=AGUARDANDO_REVISAO&scoreMin=60&city=...` → `{ data: [...], total, page }` |
| `GET /leads/:id` | Detalhe consolidado | — → `{ company, contacts, score, analysis, audit, status }` |
| `POST /leads/:id/analyze` | Executar análise | `{}` → `202 { jobId }` (assíncrono, webhook/status) |
| `GET /leads/:id/score` | Consultar score | — → `{ score: 82, tier, components }` |
| `POST /leads/:id/messages/generate` | Gerar mensagens | `{ promptVersion }` → `{ status, messages }` |
| `POST /leads/:id/messages/:mid/approve` | Aprovar | `{ approvedById }` → `{ status: APPROVED }` |
| `POST /leads/:id/messages/:mid/send` | Enviar | `{ campaignId?, scheduledFor? }` → `202 { messageId, externalId }` |
| `POST /webhooks/:provider` | Receber webhook | Payload Meta → `200 ok` (sempre 200 após persister eventId; processamento assíncrono) |
| `POST /consents` | Registrar consentimento | `{ companyId, channel, basis, proof }` → `201 { id }` |
| `POST /suppression` | Registrar opt-out/oposição | `{ contact, channel, reason }` → `201` (e derruba envios em fila) |
| `POST /campaigns` | Criar campanha | `{ name, channel, mode, templateId, caps }` → `201 { id }` |
| `POST /campaigns/:id/pause` | Pausar imediato | `{}` → `{ status: PAUSED }` (flag Redis + DB) |
| `GET /metrics` | Métricas comerciais | `?from&to&groupBy=segment` → `{ funnel, conversions, responseRate }` |
| `POST /tasks` | Atribuir tarefa | `{ companyId, type, assigneeId, dueAt }` → `201 { id }` |
| `POST /conversations/:id/transfer` | Transferir p/ humano | `{ toUserId, reason }` → `{ status: TRANSFERRED }` |

Exemplos:

```
POST /api/v1/leads/messages/generate
{
  "companyId": "cm...",
  "promptVersion": "v1",
  "targetChannel": "WHATSAPP"
}
→ 200 { "status": "ready", "messages": [ { "length": "short", "text": "...", "personalization_evidence": [...] } ] }

POST /api/v1/campaigns/:id/pause  →  200 { "status": "PAUSED", "pausedReason": "manual" }

POST /api/v1/suppression
{ "contact": "+5511912345678", "channel": "WHATSAPP", "reason": "OPT_OUT" }
→ 201 { "id": "sup_...", "blocked": true }
```

---

## 13. Segurança

- **RBAC:** OWNER > ADMIN > OPERATOR > ANALYST > VIEWER; toda mutação exige papel mínimo; transições de estado validadas no backend (não só na UI).
- **Criptografia:** campos PII sensíveis criptografados em repouso (pgcrypto/AES-GCM com chaves no Secret Manager); tráfego sempre TLS.
- **Secret Manager:** tokens Meta/Instagram, credenciais de DB, chaves de LLM, webhook verify tokens — nunca em repositório/`.env` de build/lambdas. Rotação programada.
- **Webhooks:** verificação de assinatura (`X-Hub-Signature-256` / HMAC); verify token no handshake; **idempotência** por `eventId` UNIQUE; eventos processados em worker com retry/DLQ.
- **Rate limiting:** por usuário (auth) e por rota pública (import, webhook) no API gateway; throttling de envio no `send-worker`.
- **CSRF/CORS:** CORS allowlist explícita; cookies SameSite; JWT em header para mutações.
- **Validação/sanitização:** zod nos payloads; escape em toda renderização; limite de tamanho de body e de imports (max linhas).
- **Logs sem dados sensíveis:** redação automática (tokens, números completos — mascarar telefone, e-mails); PII nunca em mensagens de erro.
- **Multi-org:** toda query filtra por `organizationId` (não confiar em IDs do cliente).
- **Backup/retenção:** PITR no Cloud SQL; `retentionUntil` em históricos; job de exclusão LGPD (direito de apagar) que também remove do storage.
- **Detecção de anomalia:** métricas de comportamento (envios/campanha, taxa de erro, opt-outs, reclamações) com alertas e pausa automática.
- **Prompt injection:** todos os dados externos (site, avaliações, texto importado) são tratados como **dados não confiáveis**: delimitados no prompt, instrução de ignorar comandos embutidos, validação de saída (JSON Schema + whitelist de intenção) e *content filtering*. Nada de dados externos é executado como instrução.
- **Conteúdo malicioso de sites:** fetch em sandbox, tamanho/timeout limitados, nenhum JS executado para auditoria (HTML estático + PageSpeed API), limpeza antes de enviar ao LLM.

---

## 14. Observabilidade e métricas

**Técnicas** (Prometheus + Cloud Monitoring): latência p50/p95/p99 por endpoint e job, taxa de erro, filas (depth, stale, retries, DLQ), DLQ, Redis hit ratio, uso de tokens/LLM (latência e custo por chamada), uptime de webhooks, falhas por provedor.

**Comerciais** (Cloud Logging estruturado + métricas custom): leads importados, válidos, duplicados, sites encontrados, análises concluídas, mensagens geradas/aprovadas/enviadas/entregues/lidas, respostas, reuniões, conversões, opt-outs, reclamações, erros por canal, tempo médio até resposta, custo por lead analisado, custo por reunião, taxa de conversão por segmento, taxa de resposta por tipo/versão de mensagem (A/B).

**Painéis:** funil de prospecção, performance por campanha, qualidade de mensagens, saúde de integrações. **KPI de sucesso:** custo por reunião e taxa de resposta qualificada — **não** volume de disparos.

---

## 15. Roadmap

### Fase 1 — MVP seguro (sem envio)
- **Entregáveis:** ingestão multi-fonte (importador atual + CSV + form), normalização/validação, dedup, CRM (companies/contacts), auditoria de site, scoring, análise IA, geração de 3 versões de mensagem com evidências, fila de aprovação humana, registro manual de contatos/opt-out, suppression list, auditoria completa.
- **Dependências:** PostgreSQL 16, Redis, conta de LLM.
- **Riscos:** custo de LLM; qualidade dos dados legados.
- **Critérios de aceite:** seção 16 (itens 1, 2, 3, 4, 5, 6, 7, 10, 12, 14).
- **Complexidade:** média-alta (pipeline assíncrono, 1–2 meses/1 dev).
- **Não implementar ainda:** nenhum envio real, Instagram, follow-up automático.

### Fase 2 — Integrações oficiais
- **Entregáveis:** WhatsApp Cloud API/BSP (templates, webhooks, status, inbox, janela 24h), consentimento registrado, pausa imediata, métricas de envio; alternativa IG inbound (responder mensagens/comentários iniciados pelo usuário).
- **Dependências:** Fase 1, contas homologadas, review do app Meta.
- **Riscos:** rejeição de templates, review lento, mudanças de política.
- **Critérios de aceite:** seção 16 (itens 8, 9, 11, 13).
- **Complexidade:** alta (integração + compliance).
- **Não implementar ainda:** Modo B em escala; cold outreach sem template.

### Fase 3 — Inteligência comercial
- **Entregáveis:** priorização avançada, segmentação, A/B de mensagens aprovadas, classificação de respostas, recomendações de serviço, pipeline comercial, agendamento de reuniões (integração calendário).
- **Dependências:** Fases 1–2, dados históricos.
- **Riscos:** overfitting do modelo, custo de LLM em escala.
- **Complexidade:** média.
- **Não implementar ainda:** Modo B para cold; decisões autônomas sem humano.

### Fase 4 — Novas fontes e escala
- **Entregáveis:** Google Places API (migração oficial), formulários/landing pages, indicações, Instagram inbound completo, anúncios→leads, CRM existente, integrações de pagamento/agendamento.
- **Dependências:** Fases anteriores, licenças.
- **Riscos:** custo de APIs/licenças, compliance de novas fontes.
- **Complexidade:** média.

---

## 16. Critérios de aceite do MVP (testáveis)

1. Importar duas vezes o mesmo lead (mesmo telefone E.164 ou domínio canônico) → apenas 1 `Company`; o segundo é `duplicate_exact` e registrado no audit.
2. Empresa sem domínio → `website_status=NO_WEBSITE`, nunca `UNREACHABLE`.
3. Domínio registrado sem conteúdo → `PARKED`; domínio com timeout/5xx → `UNREACHABLE`; ambos distintos de `NO_WEBSITE`.
4. Teste de "invenção": rodar análise sobre site com pouca evidência → todos os pontos sem evidência caem em `unknowns`; mensagens não geradas (`manual_review`).
5. Toda mensagem gerada exibe `personalization_evidence` e contém ≥1 token da evidência (validação automatizada).
6. Modo A: mensagem não é enviada sem `approvedById`; tentativa → 403.
7. Opt-out registrado → nova tentativa de envio ao contato bloqueada **imediatamente** (supressão checada no gate de envio e na geração).
8. Webhook duplicado (mesmo `eventId`) → processado uma única vez; `messages` sem duplicidade.
9. Pausar campanha → `campaign.status=PAUSED` + flag Redis; job em execução para no próximo item (< 1 s).
10. Todo evento relevante gera `audit_logs` (criação, análise, aprovação, envio, opt-out, pausa).
11. Falha de API oficial (429/5xx) → lead volta a `PRONTO_PARA_CONTATO` com erro registrado, estado preservado, sem perda de dados.
12. Tokens/segredos ausentes em logs (teste de grep em amostra de logs); testes de redação.
13. Lead sem base legal/consentimento → nunca entra em fila de envio automático; apenas Modo A.
14. Casos ambíguos (dados conflitantes, score com muitas `unknowns`, mensagem com evidência fraca) → `NEEDS_HUMAN_REVIEW` + tarefa criada.

---

## 17. Riscos e recomendação final

### 17.1 Riscos

**Técnicos:** custo de LLM/APIs em escala; rejeição de templates; rate limits da Meta; complexidade do pipeline assíncrono; qualidade de dados legados; migração de schema.

**Comerciais:** taxa de resposta depende de qualidade de segmentação; burnout de operadores em fila de aprovação; risco de reputação se mensagens genéricas vazarem.

**Legais/compliance:** scraping do Google Maps (atual) é área cinzenta — **migrar para Places API**; LGPD (base legal, finalidade, opt-out, minimização, segurança); políticas do WhatsApp (templates, cold outreach) e Instagram (sem cold DM); risco de bloqueio da conta WABA por spam → mitigado por limites, supressão, pausa automática e auditoria.

### 17.2 Recomendação clara

**Automatizar:** coleta normalizada, deduplicação, enriquecimento, auditoria de site, análise IA, scoring, geração de rascunho de mensagens com evidências, classificação de respostas, registro de consentimento/opt-out/supressão, tracking e métricas.

**Manter dependente de aprovação humana:** aprovação de envio (Modo A), edição final de mensagens, casos ambíguos, decisões de interromper/contornar regras, propostas comerciais. O Modo B (automatizado) deve ser **ativado apenas por contatos com consentimento/interação prévia** e com kill-switch obrigatório.

**Não automatizar nunca (por política):** cold outreach via WhatsApp sem template aprovado, cold DM no Instagram, disparos fora do horário/limite, follow-up após opt-out, e qualquer automação de WhatsApp Web / scraping não autorizado.

---

## Apêndice — Gap com o código atual e primeiros passos concretos

1. Criar `organizationId` e enums no `schema.prisma`; migração de `Lead` → `Company` (job de migração com `source="legacy_import"`, `legalBasis=NO_BASIS`).
2. Introduzir o **contrato de importação** no `POST /api/leads/import` (zod) mantendo compatibilidade com CSV atual.
3. Extrair o scraper atual para um **importador plugável** (`importers/google-maps-playwright`) e cadastrar `LeadSource` com `class=SCRAPED`; planejar o importador oficial `google-places-api` (Fase 4).
4. Adicionar `BullMQ` + `Redis` e extrair o trabalho síncrono (`scrape`, `import`) para jobs assíncronos.
5. Implementar `enrich` (DNS/HTTPS/PageSpeed API) e `ai-analysis` com o formato JSON da seção 4.3 e o guardrail da seção 6.
6. Construir fila de aprovação e editor de mensagem (Modo A) **sem** envio real na Fase 1.
7. Na Fase 2, integrar WhatsApp Cloud API/BSP com webhooks idempotentes e suppression list em tempo real.

> **Decisão pendente do dono do produto:** o Modo B só deve existir em produção depois que (a) houver política documentada de consentimento, (b) templates aprovados, e (c) relatório de auditoria de conformidade aprovado por advogado — mesmo que o código já exista.