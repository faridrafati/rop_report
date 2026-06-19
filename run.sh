#!/usr/bin/env bash
#
# DrillIQ — one-command bootstrap for a FRESH system (Linux / macOS / WSL).
#
#   ./run.sh            full bootstrap then start web + api (dev)
#   ./run.sh setup      bootstrap only (install, db, migrate, seed, RLS gate) — no start
#   ./run.sh start      start web + api (assumes setup already done)
#   ./run.sh test       run all tests (shared analytics + RLS gate)
#   ./run.sh reset      drop + recreate the database (DESTRUCTIVE), then setup
#   ./run.sh stop       stop the docker stack
#
# Requires: Node.js >= 20 and Docker (with the compose plugin). Everything else
# (pnpm via corepack, Postgres, the app DB role) is set up automatically.
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

# ── pretty logging ───────────────────────────────────────────────
c_grn='\033[0;32m'; c_red='\033[0;31m'; c_ylw='\033[0;33m'; c_blu='\033[0;34m'; c_off='\033[0m'
log()  { printf "${c_blu}▶ %s${c_off}\n" "$*"; }
ok()   { printf "${c_grn}✓ %s${c_off}\n" "$*"; }
warn() { printf "${c_ylw}! %s${c_off}\n" "$*"; }
die()  { printf "${c_red}✗ %s${c_off}\n" "$*" >&2; exit 1; }

# ── load .env (create from example on first run) ─────────────────
if [ ! -f .env ]; then
  log "No .env found — creating from .env.example"
  cp .env.example .env
  ok "Created .env (edit secrets before any real deployment)"
fi
set -a; . ./.env; set +a

: "${POSTGRES_USER:=drilliq}"
: "${POSTGRES_PASSWORD:=change-me-in-prod}"
: "${POSTGRES_DB:=drilliq}"
: "${POSTGRES_PORT:=5432}"
APP_DB_USER="drilliq_app"
APP_DB_PASS="change-me-app"
# Use 127.0.0.1, not localhost: on some hosts (notably Windows/WSL with Docker
# Desktop) localhost resolves to ::1 (IPv6) first and Docker's IPv6 port proxy is
# unreachable, yielding Prisma "P1001: Can't reach database server" despite a
# healthy container. 127.0.0.1 forces IPv4 and is safe on Linux/macOS too.
DB_HOST="127.0.0.1"
OWNER_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
APP_URL="postgresql://${APP_DB_USER}:${APP_DB_PASS}@${DB_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"

# ── prerequisite checks ──────────────────────────────────────────
check_prereqs() {
  command -v node >/dev/null 2>&1 || die "Node.js is required (>= 20). Install from https://nodejs.org"
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || die "Node.js >= 20 required (found $(node -v))."
  command -v docker >/dev/null 2>&1 || die "Docker is required. Install from https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is required (docker compose)."
  ok "Prerequisites OK (node $(node -v), docker present)"
}

# ── enable pnpm (via corepack, bundled with Node) ────────────────
ensure_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    log "pnpm not found — enabling via corepack"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@9.12.0 --activate >/dev/null 2>&1 || true
  fi
  # Corepack isn't bundled with every Node install (e.g. some Node 25 builds) —
  # fall back to a global npm install of the pinned pnpm version.
  if ! command -v pnpm >/dev/null 2>&1; then
    log "Corepack unavailable — installing pnpm via npm (npm install -g pnpm@9.12.0)"
    npm install -g pnpm@9.12.0 >/dev/null 2>&1 || true
  fi
  command -v pnpm >/dev/null 2>&1 || die "Could not install pnpm. Try: npm install -g pnpm@9.12.0"
  ok "pnpm $(pnpm --version)"
}

install_deps() {
  log "Installing workspace dependencies (pnpm install)"
  pnpm install
  ok "Dependencies installed"
}

# ── database ─────────────────────────────────────────────────────
start_db() {
  log "Starting PostgreSQL (docker compose up -d db)"
  docker compose up -d db
  log "Waiting for PostgreSQL to be healthy…"
  for i in $(seq 1 60); do
    local s; s="$(docker inspect --format='{{.State.Health.Status}}' drilliq-db 2>/dev/null || echo starting)"
    [ "$s" = "healthy" ] && { ok "PostgreSQL is healthy"; return 0; }
    sleep 2
  done
  die "PostgreSQL did not become healthy in time. Check: docker compose logs db"
}

psql_owner() { docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" drilliq-db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 "$@"; }

ensure_app_role() {
  log "Ensuring restricted RLS app role (${APP_DB_USER}, non-owner, no BYPASSRLS)"
  if [ -z "$(psql_owner -tAc "SELECT 1 FROM pg_roles WHERE rolname='${APP_DB_USER}'" 2>/dev/null)" ]; then
    psql_owner -c "CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASS}';" >/dev/null
  fi
  psql_owner -c "GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER}; GRANT USAGE ON SCHEMA public TO ${APP_DB_USER};" >/dev/null
  psql_owner -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_DB_USER}; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_USER};" >/dev/null 2>&1 || true
  psql_owner -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER}; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_DB_USER};" >/dev/null
  ok "App role ready"
}

migrate() {
  log "Applying Prisma migrations (as owner)"
  # Use the package's npm scripts (not `pnpm exec`): script runs put node_modules/.bin
  # on PATH so the prisma binary always resolves (avoids ERR_PNPM_RECURSIVE_EXEC "Command not found").
  DATABASE_URL="${OWNER_URL}" pnpm --filter @drilliq/db migrate:deploy
  log "Generating Prisma client"
  DATABASE_URL="${OWNER_URL}" pnpm --filter @drilliq/db generate
  # Re-grant on the freshly created tables so the app role can use them.
  ensure_app_role
  ok "Database schema in sync"
}

seed() {
  log "Seeding reference vocabulary + demo data"
  DATABASE_URL="${OWNER_URL}" pnpm --filter @drilliq/db seed
  ok "Seed complete"
}

build_shared() {
  log "Building @drilliq/shared (analytics engine)"
  pnpm --filter @drilliq/shared build
  ok "Shared package built"
}

rls_gate() {
  log "Running RLS tenant-isolation gate (as restricted app role)"
  APP_DATABASE_URL="${APP_URL}" pnpm --filter @drilliq/db test:rls
}

# Phase 2 gate: start the API as the restricted RLS role, run the auth+RBAC+RLS
# e2e suite, then stop it. Connects as drilliq_app so RLS is genuinely enforced.
e2e_gate() {
  log "Building API for the auth/RBAC/RLS e2e gate"
  pnpm --filter @drilliq/api build
  log "Starting API (restricted role) for e2e"
  ( cd api && DATABASE_URL="${APP_URL}" \
      JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-dev-access}" \
      JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-dev-refresh}" \
      API_PORT="${API_PORT:-3000}" node dist/main.js >/tmp/drilliq-api-e2e.log 2>&1 & echo $! >/tmp/drilliq-api-e2e.pid )
  local pid; pid="$(cat /tmp/drilliq-api-e2e.pid)"
  for i in $(seq 1 30); do
    curl -sf "http://localhost:${API_PORT:-3000}/api/health" >/dev/null 2>&1 && break
    sleep 1
  done
  local rc=0
  BASE="http://localhost:${API_PORT:-3000}/api" pnpm --filter @drilliq/api test:e2e || rc=$?
  kill "$pid" 2>/dev/null || true
  [ "$rc" -eq 0 ] || die "Phase 2 e2e gate failed (see /tmp/drilliq-api-e2e.log)"
}

run_tests() {
  build_shared
  log "Running analytics unit tests"
  pnpm --filter @drilliq/shared test
  log "Running API unit tests"
  pnpm --filter @drilliq/api test
  rls_gate
  e2e_gate
  ok "All tests passed"
}

start_app() {
  log "Starting web + api (pnpm dev) — Ctrl+C to stop"
  warn "Web: http://localhost:${WEB_PORT:-5173}   API: http://localhost:${API_PORT:-3000}/api   Swagger: /api/docs"
  DATABASE_URL="${APP_URL}" pnpm dev
}

do_setup() {
  check_prereqs
  ensure_pnpm
  install_deps
  build_shared
  start_db
  ensure_app_role
  migrate
  seed
  rls_gate
  ok "Setup complete. Start the app with: ./run.sh start"
}

case "${1:-all}" in
  all)   do_setup; start_app ;;
  setup) do_setup ;;
  start) check_prereqs; ensure_pnpm; start_db >/dev/null 2>&1 || true; start_app ;;
  test)  check_prereqs; ensure_pnpm; install_deps; start_db; ensure_app_role; migrate >/dev/null 2>&1 || migrate; seed; run_tests ;;
  reset)
    check_prereqs; ensure_pnpm
    warn "Resetting database (DESTRUCTIVE)…"
    start_db
    DATABASE_URL="${OWNER_URL}" pnpm --filter @drilliq/db reset
    ensure_app_role; seed; rls_gate
    ok "Reset complete" ;;
  stop)  log "Stopping docker stack"; docker compose down; ok "Stopped" ;;
  *) die "Unknown command '$1'. Use: all | setup | start | test | reset | stop" ;;
esac
