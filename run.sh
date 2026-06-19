#!/usr/bin/env bash
#
# DrillIQ — one-command bootstrap for a FRESH system (Linux / macOS / WSL).
#
#   ./run.sh            full bootstrap then start web + api (dev)
#   ./run.sh deps       check + install ALL prerequisites (Node, Docker, pnpm,
#                       Supabase CLI, Python) — for a fresh machine with only internet
#   ./run.sh setup      bootstrap only (install, db, migrate, seed, RLS gate) — no start
#   ./run.sh start      start web + api (assumes setup already done)
#   ./run.sh studio     open the DB admin UI (Prisma Studio) at http://localhost:5555
#   ./run.sh test       run all tests (shared analytics + RLS gate)
#   ./run.sh reset      drop + recreate the database (DESTRUCTIVE), then setup
#   ./run.sh dump [f]   back up the WHOLE database → backups/drilliq_<ts>.sql.gz (or f)
#   ./run.sh restore f  restore a dump (DESTRUCTIVE; portable Windows↔Ubuntu)
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
BACKUP_DIR="${ROOT}/backups"

# ── prerequisite detection + auto-install ────────────────────────
# A fresh machine with only internet can run `./run.sh` (or `./run.sh deps`)
# and have Node, Docker, pnpm — and optionally the Supabase CLI + Python for the
# legacy ETL — checked and installed automatically. Installs need sudo on Linux.
OS="$(uname -s)"
SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

pkg_mgr() {
  if   command -v apt-get >/dev/null 2>&1; then echo apt
  elif command -v dnf     >/dev/null 2>&1; then echo dnf
  elif command -v pacman  >/dev/null 2>&1; then echo pacman
  elif command -v brew    >/dev/null 2>&1; then echo brew
  else echo none; fi
}

ensure_curl() {
  command -v curl >/dev/null 2>&1 && return 0
  log "Installing curl"
  case "$(pkg_mgr)" in
    apt)    $SUDO apt-get update -y && $SUDO apt-get install -y curl ;;
    dnf)    $SUDO dnf install -y curl ;;
    pacman) $SUDO pacman -Sy --noconfirm curl ;;
    brew)   brew install curl ;;
    *)      die "curl is required but no known package manager was found — install curl, then re-run." ;;
  esac
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major; major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    [ "${major:-0}" -ge 20 ] && { ok "Node $(node -v)"; return 0; }
    warn "Node $(node -v) is older than 20 — installing a newer Node"
  else
    log "Node.js not found — installing Node 20"
  fi
  case "$(pkg_mgr)" in
    apt)  ensure_curl; curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash - && $SUDO apt-get install -y nodejs ;;
    dnf)  ensure_curl; curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO -E bash - && $SUDO dnf install -y nodejs ;;
    brew) brew install node@20 ;;
    *)    die "Could not auto-install Node. Install Node >= 20 from https://nodejs.org and re-run." ;;
  esac
  command -v node >/dev/null 2>&1 || die "Node install failed — install Node >= 20 manually and re-run."
  ok "Node $(node -v)"
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then ok "Docker present"; return 0; fi
    die "Docker is installed but the daemon isn't reachable. Start it (e.g. 'sudo systemctl start docker', or launch Docker Desktop) and re-run."
  fi
  log "Docker not found — installing Docker Engine + compose plugin"
  case "$OS" in
    Linux)
      case "$(pkg_mgr)" in
        apt|dnf|pacman)
          ensure_curl
          curl -fsSL https://get.docker.com | $SUDO sh
          $SUDO systemctl enable --now docker 2>/dev/null || true
          if [ -n "$SUDO" ]; then
            $SUDO usermod -aG docker "$USER" 2>/dev/null || true
            warn "Docker installed. Your user was added to the 'docker' group — log out and back in"
            warn "(or run 'newgrp docker'), then re-run ./run.sh so Docker works without sudo."
            exit 0
          fi ;;
        *) die "Could not auto-install Docker on this distro. See https://docs.docker.com/engine/install/ , then re-run." ;;
      esac ;;
    Darwin) die "Install Docker Desktop for Mac (https://docs.docker.com/desktop/install/mac-install/ or 'brew install --cask docker'), launch it, then re-run." ;;
    *) die "Unsupported OS for automatic Docker install. See https://docs.docker.com/get-docker/ , then re-run." ;;
  esac
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || die "Docker install incomplete. See https://docs.docker.com/get-docker/"
  ok "Docker installed"
}

# Optional tools — only needed for the legacy NIDC ETL (migration/etl.py). Never fatal.
ensure_supabase() {
  command -v supabase >/dev/null 2>&1 && { ok "Supabase CLI $(supabase --version 2>/dev/null || true)"; return 0; }
  log "Supabase CLI not found — installing (optional, for the legacy ETL)"
  if command -v brew >/dev/null 2>&1; then
    brew install supabase/tap/supabase || warn "brew install supabase failed — see https://github.com/supabase/cli#install-the-cli"
  else
    ensure_curl
    local os arch url tmp
    case "$OS" in Linux) os=linux ;; Darwin) os=darwin ;; *) os="" ;; esac
    case "$(uname -m)" in x86_64|amd64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) arch="" ;; esac
    if [ -z "$os" ] || [ -z "$arch" ]; then
      warn "No prebuilt Supabase CLI for ${OS}/$(uname -m) — see https://github.com/supabase/cli/releases"; return 0
    fi
    # Resolve the latest release asset (supabase_<ver>_<os>_<arch>.tar.gz) via the GitHub API.
    url="$(curl -fsSL -H 'Accept: application/vnd.github+json' https://api.github.com/repos/supabase/cli/releases/latest \
          | grep -oE "https://[^\"]*supabase_[0-9.]+_${os}_${arch}\.tar\.gz" | head -1)"
    if [ -z "$url" ]; then warn "Could not resolve the Supabase CLI download URL — see https://github.com/supabase/cli/releases"; return 0; fi
    tmp="$(mktemp -d)"
    if curl -fsSL "$url" -o "$tmp/supabase.tar.gz" && tar -xzf "$tmp/supabase.tar.gz" -C "$tmp" supabase; then
      $SUDO install -m 0755 "$tmp/supabase" /usr/local/bin/supabase
    else
      warn "Supabase CLI download/extract failed — see https://github.com/supabase/cli/releases"
    fi
    rm -rf "$tmp"
  fi
  command -v supabase >/dev/null 2>&1 && ok "Supabase CLI $(supabase --version 2>/dev/null || true)" \
    || warn "Supabase CLI not installed (optional — only the legacy ETL needs it)."
}

ensure_python() {
  if command -v python3 >/dev/null 2>&1; then ok "Python $(python3 --version 2>&1 | awk '{print $2}')"; return 0; fi
  log "Python 3 not found — installing (optional, for the legacy ETL)"
  case "$(pkg_mgr)" in
    apt)    $SUDO apt-get install -y python3 python3-venv python3-pip ;;
    dnf)    $SUDO dnf install -y python3 python3-pip ;;
    pacman) $SUDO pacman -Sy --noconfirm python python-pip ;;
    brew)   brew install python ;;
    *)      warn "Could not auto-install Python 3 (optional — only the legacy ETL needs it)."; return 0 ;;
  esac
  command -v python3 >/dev/null 2>&1 && ok "Python $(python3 --version 2>&1 | awk '{print $2}')" || warn "Python 3 install failed (optional)."
}

# Core prerequisites for the DrillIQ app itself (auto-installed on a fresh PC).
check_prereqs() {
  ensure_node
  ensure_docker
  ok "Prerequisites OK (node $(node -v), docker present)"
}

# Install EVERYTHING a fresh machine needs, including the optional ETL tooling.
install_all_deps() {
  ensure_node
  ensure_docker
  ensure_pnpm
  ensure_supabase
  ensure_python
  ok "All prerequisites are installed."
  warn "If Docker was just installed on Linux, log out/in (or 'newgrp docker') before continuing."
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
  if ! DATABASE_URL="${OWNER_URL}" pnpm --filter @drilliq/db generate; then
    # `prisma generate` can fail to RENAME the engine binary when another process
    # (a running dev server / IDE / antivirus) holds it — notably EPERM on Windows.
    # If a generated client is already present, the existing one is valid (the
    # schema is unchanged), so warn and continue instead of aborting the bootstrap.
    if ls node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*query_engine*.node >/dev/null 2>&1; then
      warn "prisma generate could not rewrite the client (engine file locked by another"
      warn "process). An existing generated client is present — continuing. If you changed"
      warn "the schema, close other node/dev processes and re-run."
    else
      die "prisma generate failed and no generated Prisma client was found."
    fi
  fi
  # Re-grant on the freshly created tables so the app role can use them.
  ensure_app_role
  ok "Database schema in sync"
}

seed() {
  log "Seeding reference vocabulary + demo data"
  DATABASE_URL="${OWNER_URL}" pnpm --filter @drilliq/db seed
  ok "Seed complete"
}

# ── full DB backup / restore (portable across machines + OSes) ────
# Dumps the entire `drilliq` database — schema, ALL data, RLS policies,
# functions and grants — to a single gzip'd .sql file. pg_dump + gzip run
# INSIDE the container (same postgres:16 image on every machine), so the
# output restores identically on Windows↔Ubuntu↔macOS. The restricted
# drilliq_app role is recreated by ensure_app_role, not carried in the dump.
dump_db() {
  start_db
  mkdir -p "${BACKUP_DIR}"
  local out="${1:-${BACKUP_DIR}/drilliq_$(date +%Y%m%d_%H%M%S).sql.gz}"
  log "Dumping database '${POSTGRES_DB}' → ${out}"
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" drilliq-db \
    bash -c "set -o pipefail; pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} --clean --if-exists --no-owner | gzip -c" > "${out}"
  [ -s "${out}" ] || die "Dump is empty — check: docker compose logs db"
  ok "Dump complete: ${out} ($(du -h "${out}" | cut -f1))"
}

# Restore a dump (.sql.gz or .sql) produced by `dump`. DESTRUCTIVE: replaces
# all current data. The app role is ensured first so the dump's GRANTs resolve;
# the dump is self-cleaning (pg_dump --clean --if-exists) so it drops & recreates
# every object. Then ensure_app_role re-affirms grants on the restored tables.
restore_db() {
  local file="${1:-}"
  [ -n "${file}" ] || die "Usage: ./run.sh restore <file.sql.gz|file.sql>"
  [ -f "${file}" ] || die "Backup file not found: ${file}"
  start_db
  ensure_app_role
  warn "Restoring '${file}' into '${POSTGRES_DB}' — this REPLACES all current data."
  # Drop app connections so DROPs in the dump aren't blocked.
  psql_owner -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB}' AND pid<>pg_backend_pid();" >/dev/null 2>&1 || true
  log "Loading dump"
  case "${file}" in
    *.gz) docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD}" drilliq-db \
            bash -c "set -o pipefail; gunzip -c | psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -q -v ON_ERROR_STOP=1" < "${file}" ;;
    *)    docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD}" drilliq-db \
            psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -q -v ON_ERROR_STOP=1 < "${file}" ;;
  esac
  ensure_app_role
  ok "Restore complete — '${POSTGRES_DB}' now matches the dump"
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
  warn "DB admin (Prisma Studio): ./run.sh studio → http://localhost:5555"
  DATABASE_URL="${APP_URL}" pnpm dev
}

# Admin database browser (the local "Studio"). Connects as the OWNER role, which
# is a Postgres superuser and therefore BYPASSES row-level security — so an admin
# sees ALL tenants' data here, unlike the app's restricted drilliq_app role (which
# is RLS-scoped and would show zero rows without app.current_client_id set).
open_studio() {
  start_db
  warn "Prisma Studio (DB admin) → http://localhost:5555  — Ctrl+C to stop"
  warn "Connected as the owner/superuser: shows ALL data across tenants (RLS bypassed)."
  DATABASE_URL="${OWNER_URL}" pnpm --filter @drilliq/db studio
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
  deps)  ensure_pnpm; install_all_deps ;;
  setup) do_setup ;;
  start) check_prereqs; ensure_pnpm; start_db >/dev/null 2>&1 || true; start_app ;;
  studio) check_prereqs; ensure_pnpm; open_studio ;;
  test)  check_prereqs; ensure_pnpm; install_deps; start_db; ensure_app_role; migrate >/dev/null 2>&1 || migrate; seed; run_tests ;;
  reset)
    check_prereqs; ensure_pnpm
    warn "Resetting database (DESTRUCTIVE)…"
    start_db
    DATABASE_URL="${OWNER_URL}" pnpm --filter @drilliq/db reset
    ensure_app_role; seed; rls_gate
    ok "Reset complete" ;;
  dump)    check_prereqs; dump_db "${2:-}" ;;
  restore) check_prereqs; restore_db "${2:-}" ;;
  stop)  log "Stopping docker stack"; docker compose down; ok "Stopped" ;;
  *) die "Unknown command '$1'. Use: all | deps | setup | start | test | reset | dump | restore | stop" ;;
esac
