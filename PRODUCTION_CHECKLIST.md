# Checklist de Produção - Leads Pro

## ✅ Pré-Deploy

### Infraestrutura
- [ ] PostgreSQL (Neon) provisionado e acessível
- [ ] Redis (Upstash) provisionado para BullMQ
- [ ] Domínio configurado com SSL (Vercel/Cloudflare)
- [ ] Variáveis de ambiente definidas no Vercel (frontend) e no servidor (backend)

### Variáveis de Ambiente - Frontend (Vercel)
```env
JWT_SECRET=<32+ chars, openssl rand -hex 32>
PROSPECTING_API_URL=https://seu-backend.vercel.app
PROSPECTING_ORG_ID=ignorado
NEXT_PUBLIC_APP_URL=https://seu-frontend.vercel.app
```

### Variáveis de Ambiente - Backend (Servidor/Vercel)
```env
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_SECRET=<mesmo do frontend>
GEMINI_API_KEY=<Google AI Studio>
GEMINI_MODEL=gemini-1.5-flash
GROQ_API_KEY=<Groq Console>
GROQ_MODEL=llama-3.3-70b-versatile
SENDER_NAME=Carlos Vinicius
PAGESPEED_API_KEY=<opcional>
PORT=3001
NODE_ENV=production
PERSONAL_ADMIN_PASSWORD=<senha forte 12+ chars - REMOVER APÓS BOOTSTRAP>
PASSWORD_MIN_LENGTH=12
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MS=900000
LOGIN_RATE_LIMIT=10
LOGIN_RATE_WINDOW_MS=60000
CORS_ORIGIN=https://seu-frontend.vercel.app
```

---

## ✅ Deploy

### Backend
- [ ] `npm run db:generate` (Prisma Client)
- [ ] `npm run db:deploy` (migrations em produção)
- [ ] `npm run db:bootstrap` (cria usuário admin)
- [ ] `npm run build` (compila TypeScript)
- [ ] `npm run start` (inicia servidor)
- [ ] Health check: `GET /health` retorna 200

### Frontend
- [ ] `npm run build` no Vercel (ou `vercel deploy`)
- [ ] Variáveis de ambiente configuradas no painel Vercel
- [ ] Deploy preview testado
- [ ] Deploy production promovido

---

## ✅ Pós-Deploy - Testes Críticos

### Autenticação
- [ ] Login com email/senha funciona
- [ ] Token JWT válido (15min access, 7 dias refresh)
- [ ] Refresh token rotaciona corretamente
- [ ] Logout revoga refresh token
- [ ] Troca de senha força novo login
- [ ] Rate limit login (10 req/min por IP)
- [ ] Lockout após 5 tentativas (15 min)

### Leads
- [ ] Listar leads com paginação
- [ ] Criar lead manual
- [ ] Importar CSV
- [ ] Buscar por nome/cidade/categoria
- [ ] Deduplicação funciona (externalId, telefone, domínio)

### Análise IA
- [ ] Enfileirar análise de lead
- [ ] Status acompanha: QUEUED → RUNNING → ANALYZED/NEEDS_HUMAN_REVIEW
- [ ] Findings/evidências aparecem na tela
- [ ] Score calculado e salvo
- [ ] Fallback Gemini → Groq funciona

### Mensagens
- [ ] Gerar rascunho (DRAFT)
- [ ] Aprovar mensagem (APPROVED)
- [ ] Link wa.me abre WhatsApp com mensagem pré-preenchida
- [ ] Confirmar envio marca SENT + CONTACTED_CONFIRMED
- [ ] Copiar/abrir link NÃO marca como enviado

### Ciclo de Vida
- [ ] Transições válidas funcionam
- [ ] Transições inválidas rejeitadas
- [ ] Histórico de status salvo
- [ ] Opt-out insere na suppression list
- [ ] Opt-out bloqueia novo contato
- [ ] Reply registra REPLIED

### Suppression List
- [ ] Lead em opt-out não recebe mensagem
- [ ] Telefone em opt-out bloqueia contato
- [ ] Lista de supressão consultável

---

## ✅ Monitoramento

### Logs
- [ ] Logs de erro da IA (Gemini/Groq) visíveis
- [ ] Logs de falha de jobs (BullMQ) em `job_failures`
- [ ] Uso de IA logado em `ai_usage_events`

### Métricas
- [ ] Leads novos/dia
- [ ] Taxa de análise concluída
- [ ] Taxa de aprovação de mensagens
- [ ] Taxa de envio confirmado
- [ ] Taxa de resposta
- [ ] Conversões (CONVERTED)

### Alertas
- [ ] Falha de IA > 5% em 1h → alerta
- [ ] Fila de análise > 100 pendentes → alerta
- [ ] Backup falhou → alerta
- [ ] Disco > 80% → alerta

---

## ✅ Segurança

- [ ] HTTPS forçado (HSTS)
- [ ] Cookies: HttpOnly, Secure, SameSite=Strict
- [ ] JWT_SECRET ≥ 32 chars, rotacionado anualmente
- [ ] Senha admin hasheada com Argon2id
- [ ] PERSONAL_ADMIN_PASSWORD removido do .env após bootstrap
- [ ] Rate limit em `/auth/login`
- [ ] CORS restrito ao domínio do frontend
- [ ] Headers de segurança (CSP, X-Frame-Options, etc.)
- [ ] Banco não exposto publicamente (apenas VPC/allowlist)
- [ ] Redis com TLS (rediss://) e senha

---

## ✅ Backup & Recuperação

- [ ] Backup diário automático (02:00)
- [ ] Backup semanal SQL (domingo)
- [ ] Retenção 30 dias
- [ ] Restore testado em staging (mensal)
- [ ] Script de restore documentado (`BACKUP_SCRIPT.md`)

---

## ✅ Rollback Plan

Se deploy quebrar:
```bash
# Backend: reverter imagem Docker / build anterior
# Frontend: `vercel rollback` no painel
# DB: migrations são apenas aditivas (sem DROP COLUMN)
# Se migration problemática: `pg_restore` do backup anterior
```

---

## ✅ Go-Live Checklist Final

- [ ] Todos os testes passam (`npm run test` backend + frontend)
- [ ] TypeCheck passa (`npm run typecheck`)
- [ ] Lint passa (`npm run lint`)
- [ ] Build production sem erros
- [ ] Variáveis de produção conferidas
- [ ] Backup rodou ontem à noite
- [ ] Monitoramento ativo
- [ ] Documentação de runbooks acessível à equipe
- [ ] Contatos de emergência (DBA, DevOps) atualizados

---

**Assinatura:** _______________ **Data:** _______________