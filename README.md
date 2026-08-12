# Leads Pro — Gerenciador de Leads

Sistema de gerenciamento de leads construído com **Next.js 16 + PostgreSQL + Prisma**, com captura automática de negócios do **Google Maps** (via navegador automatizado com Playwright).

## Funcionalidades

- **Dashboard** com estatísticas (total, status, categorias, leads recentes).
- **CRUD completo de leads**: nome, empresa, e-mail, telefone, WhatsApp, website, endereço, cidade, UF, categoria, avaliação, notas e tags.
- **Captura automática no Google Maps**: informe o tipo de negócio e a cidade, o sistema percorre os resultados, extrai nome/telefone/endereço/avaliação e você revisa antes de salvar. **Deduplicação automática** por telefone ou nome+cidade.
- **Filtros e busca** na listagem de leads + paginação.
- **Exportação para CSV** e **importação de CSV**.
- **Login de segurança** para proteger o acesso ao sistema.

## Requisitos

- Node.js 20+ (testado com Node 25)
- PostgreSQL local rodando na porta 5432
- Chromium (instalado automaticamente pelo Playwright na primeira execução)

## Acesso ao sistema (login)

Ao abrir o sistema, faça login com o usuário padrão:

| Campo   | Valor     |
| ------- | --------- |
| Usuário | `admin`   |
| Senha   | `admin123` |

> **Importante:** mude a senha padrão. No arquivo `.env` (ou nas variáveis de ambiente do deploy) defina `ADMIN_USER`, `ADMIN_PASSWORD` e `AUTH_SECRET` (gere uma com `openssl rand -hex 32`).

## Configuração

### 1. Banco de dados

Já existe um banco criado localmente para desenvolvimento:

```bash
# Criar (caso ainda não exista):
PGPASSWORD=postgres psql -h localhost -U postgres \
  -c "CREATE ROLE leads_app WITH LOGIN PASSWORD 'leads_app_dev';" \
  -c "CREATE DATABASE gerenciador_leads OWNER leads_app;"
```

Para usar **o seu próprio banco**, edite `DATABASE_URL` em `.env`:

```env
DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/SEU_BANCO?schema=public"
```

### 2. Instalar dependências e rodar migrações

```bash
npm install
npx playwright install chromium          # navegador para a captura
npx prisma migrate dev                  # cria as tabelas
```

### 3. Rodar

```bash
npm run dev                              # desenvolvimento em http://localhost:3000
# ou
npm run build && npm start               # produção
```

## Como usar a captura

1. Abra **Capturar na Internet** no menu.
2. Informe o que buscar (ex.: `encanador`, `restaurante`, `clínica dental`) e a cidade.
3. Clique em **Buscar leads** — o sistema abre o Google Maps automaticamente.
4. Selecione os resultados desejados e clique em **Salvar selecionados**.
5. Leads já existentes na base (mesmo telefone ou nome+cidade) são ignorados automaticamente.

> **Aviso:** a captura usa automação para fins pessoais. O Google pode bloquear buscas em excesso — evite capturas gigantes em sequência. Use com bom senso.

## Estrutura

```
src/
  app/
    page.tsx            # Dashboard
    leads/              # Lista, novo, detalhe e edição
    capturar/           # UI de captura
    importar/           # Importação CSV
    login/              # Página de login
    api/
      auth/             # Login e logout
      scrape/           # Executa a captura (POST)
      leads/            # CRUD de leads
      leads/batch/      # Salvar leads capturados em lote
      import/           # Importação CSV
      export/           # Exportação CSV
  components/           # Componentes da UI
  proxy.ts              # Guarda de autenticação (protege as rotas)
  lib/
    db.ts               # Cliente Prisma
    auth.ts             # Sessão de login
    scraper/            # Motor de captura (Playwright)
```

## Publicar (gratuito)

O app precisa de um servidor Node com Chromium (a captura usa Playwright), então **não funciona bem no plano gratuito da Vercel**.

- **Aplicação:** [Render.com](https://render.com) (plano **free** de Web Service) usando o `Dockerfile` incluído — ou uma VPS gratuita da Oracle Cloud (Always Free) para mais poder de captura.
- **Banco de dados (PostgreSQL):** [Neon](https://neon.tech) (10 GB grátis) ou [Supabase](https://supabase.com) (500 MB grátis).

Passos no Render:

1. Suba o repositório para o GitHub.
2. Em Render, **New + → Blueprint** e selecione o repositório (o `render.yaml` vem pronto).
3. Preencha `DATABASE_URL` com a connection string do Neon/Supabase e defina `ADMIN_PASSWORD`.
4. Ajuste o plano para **Free** e **Deploy**.

Os dados da tabela são criados automaticamente na primeira execução do container
(o `Dockerfile` roda `npx prisma migrate deploy` antes de iniciar o servidor).

## Solução de problemas

- **Erro de permissão no migrate**: o usuário do banco precisa de permissão para criar bancos (shadow database):
  `ALTER ROLE leads_app CREATEDB;`
- **Captura falha / "Não foi possível capturar"**: pode ser bloqueio temporário do Google. Espere alguns minutos e tente de novo.
- **Chromium não encontrado**: rode `npx playwright install chromium`.
