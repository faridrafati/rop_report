@echo off
REM ============================================================================
REM  DrillIQ - one-command bootstrap for a FRESH Windows system.
REM
REM    run.bat            full bootstrap then start web + api (dev)
REM    run.bat setup      bootstrap only (install, db, migrate, seed, RLS gate)
REM    run.bat start      start web + api (assumes setup already done)
REM    run.bat test       run all tests (analytics + RLS gate)
REM    run.bat reset      drop + recreate the database (DESTRUCTIVE), then setup
REM    run.bat stop       stop the docker stack
REM
REM  Requires: Node.js >= 20 and Docker Desktop (with compose). pnpm, Postgres,
REM  and the app DB role are set up automatically.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "POSTGRES_USER=drilliq"
set "POSTGRES_PASSWORD=change-me-in-prod"
set "POSTGRES_DB=drilliq"
set "POSTGRES_PORT=5432"
set "APP_DB_USER=drilliq_app"
set "APP_DB_PASS=change-me-app"
set "OWNER_URL=postgresql://%POSTGRES_USER%:%POSTGRES_PASSWORD%@localhost:%POSTGRES_PORT%/%POSTGRES_DB%?schema=public"
set "APP_URL=postgresql://%APP_DB_USER%:%APP_DB_PASS%@localhost:%POSTGRES_PORT%/%POSTGRES_DB%?schema=public"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=all"

if /i "%CMD%"=="all"   goto :all
if /i "%CMD%"=="setup" goto :setup
if /i "%CMD%"=="start" goto :start
if /i "%CMD%"=="test"  goto :test
if /i "%CMD%"=="reset" goto :reset
if /i "%CMD%"=="stop"  goto :stop
echo [X] Unknown command "%CMD%". Use: all ^| setup ^| start ^| test ^| reset ^| stop
exit /b 1

REM ----------------------------------------------------------------------------
:check_prereqs
where node >nul 2>&1 || (echo [X] Node.js ^>= 20 is required. https://nodejs.org & exit /b 1)
where docker >nul 2>&1 || (echo [X] Docker Desktop is required. https://docs.docker.com/get-docker/ & exit /b 1)
docker compose version >nul 2>&1 || (echo [X] Docker Compose plugin is required. & exit /b 1)
echo [OK] Prerequisites present
exit /b 0

:ensure_pnpm
where pnpm >nul 2>&1
if %errorlevel%==0 ( echo [OK] pnpm present & exit /b 0 )
echo [..] Enabling pnpm via corepack
call corepack enable >nul 2>&1
call corepack prepare pnpm@9.12.0 --activate >nul 2>&1
where pnpm >nul 2>&1 || (echo [X] Could not enable pnpm. Run: corepack enable ^&^& corepack prepare pnpm@9.12.0 --activate & exit /b 1)
echo [OK] pnpm enabled
exit /b 0

:ensure_env
if not exist ".env" (
  echo [..] Creating .env from .env.example
  copy /y ".env.example" ".env" >nul
)
exit /b 0

:install_deps
echo [..] Installing workspace dependencies
call pnpm install || exit /b 1
echo [OK] Dependencies installed
exit /b 0

:start_db
echo [..] Starting PostgreSQL (docker compose up -d db)
call docker compose up -d db || exit /b 1
echo [..] Waiting for PostgreSQL to be healthy
for /l %%i in (1,1,60) do (
  for /f "delims=" %%s in ('docker inspect --format "{{.State.Health.Status}}" drilliq-db 2^>nul') do (
    if "%%s"=="healthy" ( echo [OK] PostgreSQL is healthy & exit /b 0 )
  )
  timeout /t 2 /nobreak >nul
)
echo [X] PostgreSQL did not become healthy. Check: docker compose logs db
exit /b 1

:ensure_app_role
echo [..] Ensuring restricted RLS app role (%APP_DB_USER%)
docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db psql -U %POSTGRES_USER% -d %POSTGRES_DB% -tAc "SELECT 1 FROM pg_roles WHERE rolname='%APP_DB_USER%'" 2>nul | findstr "1" >nul
if not %errorlevel%==0 (
  docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db psql -U %POSTGRES_USER% -d %POSTGRES_DB% -c "CREATE ROLE %APP_DB_USER% LOGIN PASSWORD '%APP_DB_PASS%';" >nul
)
docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db psql -U %POSTGRES_USER% -d %POSTGRES_DB% -c "GRANT CONNECT ON DATABASE %POSTGRES_DB% TO %APP_DB_USER%; GRANT USAGE ON SCHEMA public TO %APP_DB_USER%;" >nul
docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db psql -U %POSTGRES_USER% -d %POSTGRES_DB% -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %APP_DB_USER%; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %APP_DB_USER%;" >nul 2>&1
docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db psql -U %POSTGRES_USER% -d %POSTGRES_DB% -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %APP_DB_USER%; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %APP_DB_USER%;" >nul
echo [OK] App role ready
exit /b 0

:build_shared
echo [..] Building @drilliq/shared
call pnpm --filter @drilliq/shared build || exit /b 1
exit /b 0

:migrate
echo [..] Applying Prisma migrations
set "DATABASE_URL=%OWNER_URL%"
call pnpm --filter @drilliq/db exec prisma migrate deploy || exit /b 1
call pnpm --filter @drilliq/db exec prisma generate || exit /b 1
call :ensure_app_role
echo [OK] Database schema in sync
exit /b 0

:seed
echo [..] Seeding reference vocabulary + demo data
set "DATABASE_URL=%OWNER_URL%"
call pnpm --filter @drilliq/db exec tsx prisma/seed.ts || exit /b 1
echo [OK] Seed complete
exit /b 0

:rls_gate
echo [..] Running RLS tenant-isolation gate
set "APP_DATABASE_URL=%APP_URL%"
call pnpm --filter @drilliq/db exec tsx prisma/rls.test.ts || exit /b 1
exit /b 0

:start_app
echo [..] Starting web + api (pnpm dev). Press Ctrl+C to stop.
echo     Web: http://localhost:5173   API: http://localhost:3000/api   Swagger: /api/docs
set "DATABASE_URL=%APP_URL%"
call pnpm dev
exit /b 0

REM ----------------------------------------------------------------------------
:setup
call :check_prereqs || exit /b 1
call :ensure_pnpm || exit /b 1
call :ensure_env
call :install_deps || exit /b 1
call :build_shared || exit /b 1
call :start_db || exit /b 1
call :ensure_app_role
call :migrate || exit /b 1
call :seed || exit /b 1
call :rls_gate || exit /b 1
echo [OK] Setup complete. Start the app with: run.bat start
exit /b 0

:all
call :setup || exit /b 1
call :start_app
exit /b 0

:start
call :check_prereqs || exit /b 1
call :ensure_pnpm || exit /b 1
call :start_db
call :start_app
exit /b 0

:test
call :check_prereqs || exit /b 1
call :ensure_pnpm || exit /b 1
call :ensure_env
call :install_deps || exit /b 1
call :start_db || exit /b 1
call :ensure_app_role
call :migrate || exit /b 1
call :seed || exit /b 1
call :build_shared || exit /b 1
echo [..] Running analytics unit tests
call pnpm --filter @drilliq/shared test || exit /b 1
call :rls_gate || exit /b 1
echo [OK] All tests passed
exit /b 0

:reset
call :check_prereqs || exit /b 1
call :ensure_pnpm || exit /b 1
call :start_db || exit /b 1
echo [!] Resetting database (DESTRUCTIVE)
set "DATABASE_URL=%OWNER_URL%"
call pnpm --filter @drilliq/db exec prisma migrate reset --force || exit /b 1
call :ensure_app_role
call :seed || exit /b 1
call :rls_gate || exit /b 1
echo [OK] Reset complete
exit /b 0

:stop
echo [..] Stopping docker stack
call docker compose down
echo [OK] Stopped
exit /b 0
