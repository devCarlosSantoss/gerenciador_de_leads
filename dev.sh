#!/usr/bin/env bash
# dev.sh — sobe tudo o que a aplicação precisa para rodar em desenvolvimento.
#
#   ./dev.sh          # sobe PostgreSQL + Redis + backend (:3001) + frontend (:3000)
#   ./dev.sh stop     # derruba o backend e o frontend (Redis/Postgres continuam de pé)
#   ./dev.sh status   # mostra o estado de cada serviço
#
# Logs em: .dev-logs/backend.log e .dev-logs/frontend.log

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
LOG_DIR="$ROOT/.dev-logs"
PID_DIR="$LOG_DIR/pids"

CMD="${1:-start}"

mkdir -p "$LOG_DIR" "$PID_DIR"

log()  { printf "\033[1;36m[dev]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[dev]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[dev]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[dev]\033[0m %s\n" "$*" >&2; }

port_open() { timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" >/dev/null 2>&1; }

# ────────────────────────────── infra ──────────────────────────────

ensure_postgres() {
  if port_open 5433; then
    ok "PostgreSQL já está rodando (porta 5433)"
    return
  fi
  log "PostgreSQL parado — iniciando o serviço do sistema..."
  sudo systemctl start postgresql
  sleep 2
  if port_open 5433; then
    ok "PostgreSQL iniciado (porta 5433)"
  else
    err "Falha ao iniciar o PostgreSQL. Tente manualmente: sudo systemctl start postgresql"
    exit 1
  fi
}

ensure_redis() {
  if port_open 6379; then
    ok "Redis já está rodando (porta 6379)"
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    log "Redis parado — iniciando container Docker 'aurora-redis'..."
    if docker ps -a --format '{{.Names}}' | grep -qx 'aurora-redis'; then
      docker start aurora-redis
    else
      docker run -d --name aurora-redis --restart unless-stopped -p 6379:6379 redis:7-alpine
    fi
  else
    log "Docker indisponível — tentando redis-server do sistema..."
    sudo systemctl start redis-server
  fi
  sleep 2
  if port_open 6379; then
    ok "Redis iniciado (porta 6379)"
  else
    err "Falha ao iniciar o Redis. Tente manualmente: docker run -d --name aurora-redis -p 6379:6379 redis:7-alpine"
    exit 1
  fi
}

# ────────────────────────────── apps ──────────────────────────────

ensure_deps() {
  local dir="$1"
  if [[ ! -d "$dir/node_modules" ]]; then
    log "Instalando dependências em $dir ..."
    (cd "$dir" && npm install)
  else
    ok "Dependências presentes em $dir"
  fi
}

run_migrations() {
  log "Aplicando migrações do Prisma (backend)..."
  if (cd "$BACKEND" && npx prisma migrate deploy); then
    ok "Migrações aplicadas"
  else
    warn "migrate deploy falhou — se o schema já existe no banco, isso é normal (P3005). Seguindo..."
  fi
}

start_app() {
  local app="$1" dir="$2" cmd="$3" port="$4"
  local pidf="$PID_DIR/$app.pid" logfile="$LOG_DIR/$app.log"

  if port_open "$port"; then
    ok "$app já está respondendo em :$port"
    return
  fi

  log "Iniciando $app em :$port ..."
  (cd "$dir" && exec bash -lc "$cmd") > "$logfile" 2>&1 &
  local pid=$!
  echo "$pid" > "$pidf"

  local i
  for i in $(seq 1 90); do
    if port_open "$port"; then
      ok "$app no ar: $([ "$app" = backend ] && echo http://localhost:3001 || echo http://localhost:3000)"
      return
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      err "$app caiu durante a inicialização. Veja $logfile"
      exit 1
    fi
    sleep 1
  done
  err "$app não respondeu em 90s. Veja $logfile"
  exit 1
}

# ────────────────────────────── comandos ──────────────────────────────

start() {
  ensure_postgres
  ensure_redis

  ensure_deps "$BACKEND"
  ensure_deps "$ROOT"
  run_migrations

  start_app backend  "$BACKEND" "npm run dev" 3001
  start_app frontend "$ROOT"     "npm run dev" 3000

  ok "Tudo pronto! 🚀"
  ok "Frontend: http://localhost:3000"
  ok "Backend : http://localhost:3001"
  ok "Para derrubar o backend/frontend: ./dev.sh stop"
}

stop() {
  for port in 3001 3000; do
    if port_open "$port"; then
      fuser -k -TERM "${port}/tcp" >/dev/null 2>&1 || true
    fi
  done
  sleep 2
  for port in 3001 3000; do
    fuser -k -KILL "${port}/tcp" >/dev/null 2>&1 || true
  done

  local pf
  for pf in "$PID_DIR"/*.pid; do
    [[ -e "$pf" ]] || continue
    local pid
    pid="$(cat "$pf")"
    kill -TERM "$pid" 2>/dev/null || true
    pkill -P "$pid" 2>/dev/null || true
    rm -f "$pf"
  done

  ok "Backend e frontend parados."
  ok "Redis e PostgreSQL continuam de pé. Para derrubá-los:"
  ok "  docker stop aurora-redis   (Redis)"
  ok "  sudo systemctl stop postgresql   (PostgreSQL)"
}

status() {
  if port_open 5432; then ok "PostgreSQL  :5432  rodando"; else warn "PostgreSQL  :5432  parado"; fi
  if port_open 6379; then ok "Redis       :6379  rodando"; else warn "Redis       :6379  parado"; fi
  if port_open 3001; then ok "Backend     :3001  rodando"; else warn "Backend     :3001  parado"; fi
  if port_open 3000; then ok "Frontend    :3000  rodando"; else warn "Frontend    :3000  parado"; fi
}

case "$CMD" in
  start)  start ;;
  stop)   stop ;;
  status) status ;;
  *)
    err "Uso: ./dev.sh [start|stop|status]"
    exit 1
    ;;
esac
