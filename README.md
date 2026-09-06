# Leads Pro — Gerenciador de Leads

Sistema para **capturar, organizar e acompanhar leads** (clientes em potencial) direto do
Google Maps, com painel de estatísticas, busca/filtros, importação e exportação CSV.

Funciona **100% local** no seu computador (Linux ou Windows). O **login não pede senha**
— basta clicar em **Entrar**.

---

## Índice

- [Como funciona](#como-funciona)
- [O que você precisa instalar](#o-que-você-precisa-instalar)
- [Passo a passo (Linux e Windows)](#passo-a-passo-linux-e-windows)
  - [Passo 1 — Instalar as ferramentas](#passo-1--instalar-as-ferramentas)
  - [Passo 2 — Subir o banco de dados (PostgreSQL) e o Redis](#passo-2--subir-o-banco-de-dados-postgresql-e-o-redis)
  - [Passo 3 — Baixar o código](#passo-3--baixar-o-código)
  - [Passo 4 — Configurar os arquivos de ambiente](#passo-4--configurar-os-arquivos-de-ambiente)
  - [Passo 5 — Instalar as dependências](#passo-5--instalar-as-dependências)
  - [Passo 6 — Criar as tabelas do banco](#passo-6--criar-as-tabelas-do-banco)
  - [Passo 7 — Criar o primeiro acesso](#passo-7--criar-o-primeiro-acesso)
  - [Passo 8 — Rodar a aplicação](#passo-8--rodar-a-aplicação)
  - [Passo 9 — Entrar no sistema](#passo-9--entrar-no-sistema)
- [Comandos úteis](#comandos-úteis)
- [Solução de problemas](#solução-de-problemas)
- [Funcionalidades](#funcionalidades)
- [Estrutura do projeto](#estrutura-do-projeto)

---

## Como funciona

A aplicação tem **duas partes** que rodam ao mesmo tempo no seu computador:

| Parte | O que faz | Endereço |
|---|---|---|
| **Frontend** (Next.js) | A tela que você usa no navegador | http://localhost:3000 |
| **Backend** (NestJS) | A "cabeça" que grava os dados e faz a automação | http://localhost:3001 |
| **PostgreSQL** | O banco de dados (guarda os leads) | porta 5432 |
| **Redis** | Memória de apoio (filas e controle de acessos) | porta 6379 |

> ⚠️ Por ser 100% local e sem senha, use apenas em máquinas de **sua confiança**.
> Não deixe a porta 3000/3001 aberta para a internet.

---

## O que você precisa instalar

| Ferramenta | Por quê | Linux (Ubuntu/Debian) | Windows |
|---|---|---|---|
| **Node.js 20+** | Roda o código (frontend e backend) | terminal | [nodejs.org](https://nodejs.org) (versão LTS) |
| **Git** | Baixar o código | terminal | [git-scm.com](https://git-scm.com) |
| **Docker** (opcional) | Subir o banco e o Redis sem instalar nada a mais | terminal | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **PostgreSQL** | Banco de dados | terminal | via Docker (mais fácil) |
| **Redis** | Fila/memória | terminal | via Docker (mais fácil) |

> **Dica para leigos:** a rota mais simples é usar **Docker** para o banco e o Redis
> (mesmos comandos no Linux e no Windows). Na seção abaixo, se você não quiser usar
> Docker, há também o passo a passo nativo para Linux.

---

## Passo a passo (Linux e Windows)

### Passo 1 — Instalar as ferramentas

#### 🐧 Linux (Ubuntu/Debian)

Abra o **terminal** (Ctrl+Alt+T) e rode:

```bash
# 1. Node.js 20 (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Git
sudo apt-get install -y git

# 3. Docker (recomendado para o banco/Redis)
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker

# 4. Confira
node -v   # deve mostrar v20 ou maior
git --version
```

#### 🪟 Windows

1. Instale o **Node.js LTS** em [nodejs.org](https://nodejs.org) (clique em "Next" até o fim).
2. Instale o **Git for Windows** em [git-scm.com](https://git-scm.com) (clique em "Next" até o fim;
   na tela "Adjusting your PATH" deixe a opção recomendada).
3. Instale o **Docker Desktop** em [docker.com](https://www.docker.com/products/docker-desktop/) e **abra o Docker**.
4. Abra o **Git Bash** (menu Iniciar → pesquise "Git Bash"). É nele que você vai digitar os comandos.

> No Windows, sempre que este guia mostrar comandos como `cd pasta`, digite-os no **Git Bash**.

---

### Passo 2 — Subir o banco de dados (PostgreSQL) e o Redis

#### ✅ Rota Docker (recomendada — Linux e Windows)

No terminal (Git Bash no Windows):

```bash
# PostgreSQL (banco de dados)
docker run -d --name leads-postgres \
  -e POSTGRES_USER=leads_app \
  -e POSTGRES_PASSWORD=leads_app_dev \
  -e POSTGRES_DB=aurora_prospecting \
  -p 5432:5432 postgres:16

# Redis (memória de apoio)
docker run -d --name leads-redis -p 6379:6379 redis:7-alpine
```

Pronto, banco e Redis já estão rodando. (Se quiser parar depois: `docker stop leads-postgres leads-redis`
e para subir de novo: `docker start leads-postgres leads-redis`.)

#### 🐧 Rota Linux sem Docker (serviços do sistema)

```bash
# 1. Instalar
sudo apt-get install -y postgresql redis-server

# 2. Iniciar
sudo systemctl start postgresql redis-server
sudo systemctl enable postgresql redis-server

# 3. Criar o usuário e o banco do sistema
sudo -u postgres psql
```

Dentro do `psql` (a tela que abriu), cole:

```sql
CREATE USER leads_app WITH PASSWORD 'leads_app_dev' CREATEDB;
CREATE DATABASE aurora_prospecting OWNER leads_app;
\q
```

---

### Passo 3 — Baixar o código

No terminal (dentro da pasta onde você quer o projeto):

```bash
git clone git@github.com:devCarlosSantoss/gerenciador_de_leads.git
cd gerenciador_de_leads
```

> Sem chave SSH configurada, use o link https:
> `git clone https://github.com/devCarlosSantoss/gerenciador_de_leads.git`
> — ou baixe o ZIP verde "Code" no GitHub e extraia em uma pasta, depois abra o terminal nessa pasta.

---

### Passo 4 — Configurar os arquivos de ambiente

Os arquivos de configuração **não acompanham o código** (por segurança) — você copia o modelo:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Agora abra os dois arquivos em um editor de texto (Bloco de Notas, VS Code, Gedit, Nano):

**1. `backend/.env`** — a única coisa que pode mudar é a linha do banco:

```env
DATABASE_URL="postgresql://leads_app:leads_app_dev@localhost:5432/aurora_prospecting?schema=public"
```

> Se o seu PostgreSQL rodar em **outra porta** (ex.: 5433), troque o `5432` pela porta correta.

**2. `backend/.env` e `.env`** — coloque a **mesma** chave secreta nos dois. Para gerar uma:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado e cole no campo `JWT_SECRET="..."` dos **dois** arquivos
(substituindo o valor de exemplo). O valor precisa ter no mínimo 32 caracteres.

No `.env` (raiz), confirme que está assim:

```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
JWT_SECRET="a-mesma-chave-que-você-gerou"
```

No `backend/.env`, confirme também `REDIS_URL="redis://localhost:6379"`.

> 🔒 **Nunca** compartilhe os arquivos `.env` — eles contêm segredos da sua instalação.
> O Git já está configurado para ignorá-los (`.gitignore`).

---

### Passo 5 — Instalar as dependências

```bash
cd backend
npm install
cd ..
npm install
```

> Na primeira vez isso demora alguns minutos. Se aparecer algum erro, rode `npm install`
> novamente — às vezes a internet cai no meio do download.

---

### Passo 6 — Criar as tabelas do banco

```bash
cd backend
npx prisma migrate deploy
cd ..
```

Você deve ver algo como `Applying migration 20260906194412_init` e, no final,
mensagens de sucesso.

---

### Passo 7 — Criar o primeiro acesso

Cria o usuário administrador (só a primeira vez). A senha aqui é **usada apenas no
bootstrap** — o login do sistema não vai pedir senha:

```bash
cd backend
PERSONAL_ADMIN_PASSWORD='minha-senha-forte-123' npm run db:bootstrap
cd ..
```

- **Windows (Git Bash):** o mesmo comando funciona.
- **Windows (PowerShell):** use `$env:PERSONAL_ADMIN_PASSWORD='minha-senha-forte-123'; npm run db:bootstrap`

Você deve ver: `✔ Usuário admin criado: carlos@auroracode.tech`.

---

### Passo 8 — Rodar a aplicação

#### 🐧 Linux

Na pasta do projeto:

```bash
./dev.sh
```

O script sobe tudo (banco, Redis, backend e frontend) e exibe:

```
Frontend: http://localhost:3000
Backend : http://localhost:3001
```

Para ver o estado ou parar: `./dev.sh status` e `./dev.sh stop`.

#### 🪟 Windows

Abra **dois** terminais (Git Bash) e rode um comando em cada:

- **Terminal 1** (backend):
  ```bash
  cd backend
  npm run dev
  ```
- **Terminal 2** (frontend):
  ```bash
  npm run dev
  ```

> Deixe os dois terminais abertos enquanto usar o sistema. Para parar, feche os terminais
> (ou aperte Ctrl+C nos dois).

#### 📸 Navegador para a captura (opcional)

A captura automática do Google Maps usa um navegador controlado pelo sistema. Instale na
primeira vez que for usar essa função:

```bash
npx playwright install chromium
```

---

### Passo 9 — Entre no sistema

1. Abra o navegador e acesse **http://localhost:3000**
2. Clique no botão **Entrar** (não pede e-mail nem senha)

Pronto! 🎉 Você está no **Dashboard** do gerenciador de leads.

---

## Comandos úteis

| Ação | Linux | Windows |
|---|---|---|
| Subir tudo | `./dev.sh` | `npm run dev` (2 terminais) |
| Ver status | `./dev.sh status` | — |
| Parar backend/frontend | `./dev.sh stop` | Ctrl+C nos terminais |
| Rodar testes | `npm test` (e `cd backend && npm test`) | igual |
| Verificar tipos | `npm run typecheck` | igual |
| Abrir o banco (visual) | `cd backend && npm run db:studio` | igual |

---

## Solução de problemas

**`Error: P1001 ... Can't reach database server`** — o PostgreSQL não está rodando ou a porta
está errada. Confira o Passo 2 e a porta no `backend/.env`.

**`DATABASE_URL` / `JWT_SECRET` inválido** — confira se o `JWT_SECRET` tem 32+ caracteres e é o
**mesmo** nos dois `.env`.

**`Redis connection ... ECONNREFUSED`** — o Redis não está rodando. Rode novamente:
`docker start leads-redis` (Docker) ou `sudo systemctl start redis-server` (Linux nativo).

**`npx prisma migrate deploy` falha com P3005** — as tabelas já existem, pode ignorar.

**Captura falha / "Não foi possível capturar"** — rode `npx playwright install chromium`.
Também pode ser bloqueio temporário do Google: aguarde alguns minutos e tente de novo.

**Porta já em uso** — outro programa está na porta 3000/3001. Feche o que estiver usando
ou mude a porta (`PORT` no `backend/.env` e `NEXT_PUBLIC_API_URL`/`PORT` do frontend).

---

## Funcionalidades

- **Dashboard** com estatísticas (total, status, categorias, leads recentes).
- **CRUD completo de leads**: nome, empresa, e-mail, telefone, WhatsApp, website, endereço,
  cidade, UF, categoria, avaliação, notas e tags.
- **Captura automática no Google Maps**: informe o tipo de negócio e a cidade; o sistema
  percorre os resultados, extrai os dados e você revisa antes de salvar. **Deduplicação
  automática** por telefone ou nome+cidade.
- **Filtros, busca e paginação** na listagem.
- **Exportação CSV** e **importação CSV**.
- **Login local** (sem senha — aplicação single-user).

---

## Estrutura do projeto

```
.
├── src/            # Frontend (Next.js)
│   ├── app/        # Páginas e rotas da API (proxy)
│   ├── components/ # Componentes de interface
│   └── lib/        # Sessão, captura (Playwright), helpers
├── backend/        # Backend (NestJS) — autenticação e dados
│   ├── src/        # Módulos (auth, leads, análise, IA, filas)
│   └── prisma/     # Schema e migrações do banco
├── prisma/         # Migrações compartilhadas (fonte: backend/prisma)
├── dev.sh          # Script que sobe tudo (Linux/macOS)
└── Dockerfile      # Imagem para produção
```

> 💡 Dúvidas ou melhorias? Abra uma *issue* no GitHub.