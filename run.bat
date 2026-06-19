@echo off
REM ============================================================================
REM  DrillIQ - one-command bootstrap for a FRESH Windows system.
REM
REM    run.bat            full bootstrap then start web + api (dev)
REM    run.bat deps       check + install ALL prerequisites (Node, Docker, pnpm,
REM                       Supabase CLI, Python) - for a fresh PC with only internet
REM    run.bat setup      bootstrap only (install, db, migrate, seed, RLS gate)
REM    run.bat start      start web + api (assumes setup already done)
REM    run.bat studio     open the DB admin UI (Prisma Studio) at http://localhost:5555
REM    run.bat test       run all tests (analytics + RLS gate)
REM    run.bat reset      drop + recreate the database (DESTRUCTIVE), then setup
REM    run.bat dump [f]   back up the WHOLE database -> backups\drilliq_<ts>.sql.gz (or f)
REM    run.bat restore f  restore a dump (DESTRUCTIVE; portable Windows^<-^>Ubuntu)
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
REM Use 127.0.0.1, NOT localhost: on some Windows hosts localhost resolves to ::1
REM (IPv6) first and Docker's IPv6 port proxy is unreachable -> Prisma "P1001:
REM Can't reach database server" even though the container is healthy.
set "DB_HOST=127.0.0.1"
set "OWNER_URL=postgresql://%POSTGRES_USER%:%POSTGRES_PASSWORD%@%DB_HOST%:%POSTGRES_PORT%/%POSTGRES_DB%?schema=public"
set "APP_URL=postgresql://%APP_DB_USER%:%APP_DB_PASS%@%DB_HOST%:%POSTGRES_PORT%/%POSTGRES_DB%?schema=public"

REM API runtime secrets, exported into the environment for `pnpm dev`. The API's
REM ConfigModule reads process env, and its cwd-based .env lookup runs in api\ and
REM never reaches the repo-root .env, so these must be present in the environment.
REM Pre-set values (e.g. real secrets) in your shell take precedence.
if not defined JWT_ACCESS_SECRET  set "JWT_ACCESS_SECRET=change-me-access-secret"
if not defined JWT_REFRESH_SECRET set "JWT_REFRESH_SECRET=change-me-refresh-secret"
if not defined JWT_ACCESS_TTL     set "JWT_ACCESS_TTL=900"
if not defined JWT_REFRESH_TTL    set "JWT_REFRESH_TTL=604800"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=all"

if /i "%CMD%"=="all"   goto :all
if /i "%CMD%"=="deps"  goto :deps
if /i "%CMD%"=="setup" goto :setup
if /i "%CMD%"=="start" goto :start
if /i "%CMD%"=="studio" goto :studio
if /i "%CMD%"=="test"  goto :test
if /i "%CMD%"=="reset" goto :reset
if /i "%CMD%"=="dump"  goto :dump
if /i "%CMD%"=="restore" goto :restore
if /i "%CMD%"=="stop"  goto :stop
echo [X] Unknown command "%CMD%". Use: all ^| deps ^| setup ^| start ^| studio ^| test ^| reset ^| dump ^| restore ^| stop
exit /b 1

REM ----------------------------------------------------------------------------
REM Detect core prerequisites; if any are missing/outdated, install them via winget
REM (Node + Docker Desktop). winget ships with Windows 10/11 (App Installer).
:check_prereqs
set "MISSING="
where node >nul 2>&1 || set "MISSING=1"
if not defined MISSING (
  for /f "tokens=1 delims=v." %%a in ('node -v') do set "NODEMAJ=%%a"
  if !NODEMAJ! LSS 20 set "MISSING=1"
)
where docker >nul 2>&1 || set "MISSING=1"
if not defined MISSING (
  docker compose version >nul 2>&1 || set "MISSING=1"
)
if defined MISSING (
  echo [..] Missing or outdated prerequisites - installing Node + Docker via winget
  call :install_core_deps
  echo [i] Prerequisites installed. Open a NEW terminal so PATH refreshes.
  echo     If Docker Desktop was just installed, REBOOT and launch it once.
  echo     Then run: run.bat
  exit /b 1
)
docker info >nul 2>&1 || (echo [X] Docker is installed but not running. Launch Docker Desktop, then re-run. & exit /b 1)
echo [OK] Prerequisites present (Node + Docker)
exit /b 0

:winget_check
where winget >nul 2>&1 && exit /b 0
echo [X] winget (App Installer) not found. Install it from the Microsoft Store,
echo     or manually install Node ^>=20 and Docker Desktop, then re-run.
exit /b 1

:install_core_deps
call :winget_check || exit /b 1
where node >nul 2>&1 || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where docker >nul 2>&1 || winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
exit /b 0

REM Optional tooling for the legacy NIDC ETL (migration\etl.py). Never fatal.
:ensure_python_win
where python >nul 2>&1 && ( echo [OK] Python present & exit /b 0 )
call :winget_check || exit /b 0
echo [..] Installing Python via winget (optional, for the legacy ETL)
winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
exit /b 0

:ensure_supabase_win
where supabase >nul 2>&1 && ( echo [OK] Supabase CLI present & exit /b 0 )
echo [..] Downloading Supabase CLI (optional, for the legacy ETL)
set "SBDIR=%USERPROFILE%\.drilliq\bin"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $dir='%SBDIR%'; New-Item -ItemType Directory -Force -Path $dir ^| Out-Null; $r=Invoke-RestMethod -Headers @{'User-Agent'='drilliq'} -Uri 'https://api.github.com/repos/supabase/cli/releases/latest'; $a=$r.assets ^| Where-Object { $_.name -match 'windows_amd64\.zip$' } ^| Select-Object -First 1; $zip=Join-Path $env:TEMP 'supabase.zip'; Invoke-WebRequest -Uri $a.browser_download_url -OutFile $zip; Expand-Archive -Path $zip -DestinationPath $dir -Force; Remove-Item $zip; $u=[Environment]::GetEnvironmentVariable('PATH','User'); if ($u -notlike ('*'+$dir+'*')) { [Environment]::SetEnvironmentVariable('PATH', $u+';'+$dir, 'User') } } catch { Write-Host $_; exit 1 }"
if errorlevel 1 ( echo [i] Supabase CLI download failed. Install manually: https://github.com/supabase/cli & exit /b 0 )
echo [OK] Supabase CLI installed to %SBDIR% (open a NEW terminal for it on PATH)
exit /b 0

:install_all_deps
call :install_core_deps
call :ensure_python_win
call :ensure_supabase_win
echo [OK] Prerequisite installation attempted.
echo [i] Open a NEW terminal so PATH updates take effect. If Docker Desktop was
echo     just installed, REBOOT and launch it once, then run: run.bat
exit /b 0

:ensure_pnpm
where pnpm >nul 2>&1
if %errorlevel%==0 ( echo [OK] pnpm present & exit /b 0 )
echo [..] Enabling pnpm via corepack
call corepack enable >nul 2>&1
call corepack prepare pnpm@9.12.0 --activate >nul 2>&1
where pnpm >nul 2>&1 && ( echo [OK] pnpm enabled via corepack & exit /b 0 )
REM Corepack is not bundled with every Node install (e.g. some Node 25 builds) —
REM fall back to a global npm install of the pinned pnpm version.
echo [..] Corepack unavailable; installing pnpm via npm (npm install -g pnpm@9.12.0)
call npm install -g pnpm@9.12.0 >nul 2>&1
where pnpm >nul 2>&1 || (echo [X] Could not install pnpm. Try: npm install -g pnpm@9.12.0 & exit /b 1)
echo [OK] pnpm installed via npm
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
  REM `ping` instead of `timeout`: timeout reads the console input handle and aborts
  REM with "Input redirection is not supported" when stdin isn't a console (CI,
  REM pipes, non-interactive shells). ping -n 3 on loopback waits ~2s and never reads stdin.
  ping -n 3 127.0.0.1 >nul
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
REM Use the package's npm scripts (not `pnpm exec`): script runs put node_modules\.bin
REM on PATH so the prisma binary always resolves (avoids ERR_PNPM_RECURSIVE_EXEC "Command not found").
call pnpm --filter @drilliq/db migrate:deploy || exit /b 1
call pnpm --filter @drilliq/db generate || exit /b 1
call :ensure_app_role
echo [OK] Database schema in sync
exit /b 0

:seed
echo [..] Seeding reference vocabulary + demo data
set "DATABASE_URL=%OWNER_URL%"
call pnpm --filter @drilliq/db seed || exit /b 1
echo [OK] Seed complete
exit /b 0

:rls_gate
echo [..] Running RLS tenant-isolation gate
set "APP_DATABASE_URL=%APP_URL%"
call pnpm --filter @drilliq/db test:rls || exit /b 1
exit /b 0

:start_app
echo [..] Starting web + api (pnpm dev). Press Ctrl+C to stop.
echo     Web: http://localhost:5173   API: http://localhost:3000/api   Swagger: /api/docs
echo     DB admin (Prisma Studio): run.bat studio -^> http://localhost:5555
set "DATABASE_URL=%APP_URL%"
call pnpm dev
exit /b 0

REM ----------------------------------------------------------------------------
:deps
call :install_all_deps
where node >nul 2>&1 && call :ensure_pnpm
exit /b 0

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

REM Admin DB browser. Connects as the OWNER role (a Postgres superuser, so it
REM BYPASSES RLS) -> an admin sees ALL tenants' data, unlike the app's restricted
REM drilliq_app role which is RLS-scoped and would show zero rows.
:studio
call :check_prereqs || exit /b 1
call :ensure_pnpm || exit /b 1
call :start_db || exit /b 1
echo [i] Prisma Studio (DB admin) -^> http://localhost:5555  (Ctrl+C to stop)
echo     Connected as owner/superuser: shows ALL data across tenants (RLS bypassed).
set "DATABASE_URL=%OWNER_URL%"
call pnpm --filter @drilliq/db studio
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
call pnpm --filter @drilliq/db reset || exit /b 1
call :ensure_app_role
call :seed || exit /b 1
call :rls_gate || exit /b 1
echo [OK] Reset complete
exit /b 0

REM ----------------------------------------------------------------------------
REM Full DB backup / restore. pg_dump + gzip run INSIDE the drilliq-db container
REM (same postgres:16 image on every machine), so a dump made here restores
REM identically on Windows or Ubuntu. The drilliq_app role is recreated by
REM ensure_app_role, not carried in the dump.
:dump
call :check_prereqs || exit /b 1
call :start_db || exit /b 1
if not exist "backups" mkdir "backups"
set "OUT=%~2"
if "!OUT!"=="" (
  for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "OUT=backups\drilliq_%%i.sql.gz"
)
echo [..] Dumping database %POSTGRES_DB% to !OUT!
docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db bash -c "set -o pipefail; pg_dump -U %POSTGRES_USER% -d %POSTGRES_DB% --clean --if-exists --no-owner | gzip -c" > "!OUT!"
if errorlevel 1 ( echo [X] Dump failed - check: docker compose logs db & exit /b 1 )
for %%A in ("!OUT!") do if %%~zA EQU 0 ( echo [X] Dump is empty - check: docker compose logs db & exit /b 1 )
echo [OK] Dump complete: !OUT!
exit /b 0

:restore
call :check_prereqs || exit /b 1
call :start_db || exit /b 1
set "FILE=%~2"
if "!FILE!"=="" ( echo [X] Usage: run.bat restore ^<file.sql.gz ^| file.sql^> & exit /b 1 )
if not exist "!FILE!" ( echo [X] Backup file not found: !FILE! & exit /b 1 )
call :ensure_app_role
echo [WARN] Restoring "!FILE!" into %POSTGRES_DB% - this REPLACES all current data
docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db psql -U %POSTGRES_USER% -d %POSTGRES_DB% -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='%POSTGRES_DB%' AND pid<>pg_backend_pid();" >nul 2>&1
echo [..] Loading dump
set "GZ="
echo !FILE!|findstr /i "\.gz$" >nul && set "GZ=1"
if defined GZ (
  docker exec -i -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db bash -c "set -o pipefail; gunzip -c | psql -U %POSTGRES_USER% -d %POSTGRES_DB% -q -v ON_ERROR_STOP=1" < "%FILE%"
) else (
  docker exec -i -e PGPASSWORD=%POSTGRES_PASSWORD% drilliq-db psql -U %POSTGRES_USER% -d %POSTGRES_DB% -q -v ON_ERROR_STOP=1 < "%FILE%"
)
if errorlevel 1 ( echo [X] Restore failed & exit /b 1 )
call :ensure_app_role
echo [OK] Restore complete - %POSTGRES_DB% now matches the dump
exit /b 0

:stop
echo [..] Stopping docker stack
call docker compose down
echo [OK] Stopped
exit /b 0
