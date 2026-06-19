# DrillIQ

**Drill-bit performance & Daily-Drilling-Report (DDR) analytics platform.**

DrillIQ is a login-gated, multi-tenant platform that helps an oil & gas operator
and its drilling contractors run the full drilling-optimization loop:

> **Plan** bit & parameter selection → **Capture** what happened at the rig →
> **Analyze** drilling efficiency (ROP, MSE, HSI, cost-per-foot, founder point) →
> **Report** to engineering and management.

It compares bit performance across wells/fields/contractors, surfaces drilling
dysfunction (founder, stick-slip, whirl, balling), drives cost-per-foot down, and
standardises DDR capture — all with **strict per-tenant data isolation** so a
contractor only ever sees its own client's wells. Deployable **on-prem or in any
cloud** (12-factor config, Docker).

---

## Table of contents

- [Quick start](#quick-start-fresh-machine-only-internet)
- [Prerequisites](#prerequisites)
- [`run.sh` / `run.bat` command reference](#runsh--runbat-command-reference)
- [Data: import & export](#data-import--export)  ← full-DB backup/restore, DDR-PDF import, report exports, WITSML
- [Architecture](#architecture)
- [Roles, logins & access](#roles-logins--access)
- [Working across two machines](#working-across-two-machines)
- [Domain analytics](#domain-analytics-drilliqshared)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Build status](#build-status)
- [License](#license)

---

## Quick start (fresh machine, only internet)

On a brand-new machine you need **nothing pre-installed but internet** — the run
script checks for and installs every prerequisite (Node ≥ 20, Docker, pnpm; and
optionally the Supabase CLI + Python), then provisions PostgreSQL, the database
roles, migrations and seed data, and starts the app.

```bash
# Linux / macOS / WSL                    # Windows (PowerShell or cmd)
./run.sh deps     # install all prereqs  >  run.bat deps
./run.sh          # bootstrap + start     > run.bat
```

Then open:

| Surface | URL | Notes |
|---------|-----|-------|
| **Web app** | http://localhost:5173 | the SPA — log in with a demo account below |
| API | http://localhost:3000/api | REST, all routes under `/api` |
| Swagger / OpenAPI | http://localhost:3000/api/docs | interactive API docs |
| ROP Optimization | http://localhost:5173/rop | parameter-optimization workbench |
| Import DDR (PDF) | http://localhost:5173/import-ddr | Office-Engineer PDF importer |
| DB admin (Prisma Studio) | http://localhost:5555 | start with `./run.sh studio` |

> First run installs heavy toolchains, so it can take several minutes. If Docker
> or Node were already installed, `./run.sh` alone does everything in seconds.

---

## Prerequisites

| Tool | Why | Auto-installed by `run.sh deps` / `run.bat deps` |
|------|-----|--------------------------------------------------|
| **Node.js ≥ 20** | web + api + tooling | ✅ (NodeSource on Linux, winget on Windows) |
| **Docker** + Compose | runs PostgreSQL (and the full stack) | ✅ (get.docker.com on Linux, Docker Desktop via winget on Windows) |
| **pnpm 9** | workspace package manager | ✅ (via corepack, npm fallback) |
| Supabase CLI | only the legacy ETL | ✅ (optional, never fatal) |
| Python 3 | only the legacy ETL | ✅ (optional, never fatal) |

Platform notes for a fresh install:
- **Linux:** installs use `sudo`. After Docker is installed, log out/in (or run
  `newgrp docker`) once so your user can use Docker without `sudo`, then re-run.
- **Windows:** installs use `winget`. Afterwards open a **new terminal** so PATH
  updates apply, and if Docker Desktop was just installed, **reboot and launch it
  once** before re-running. Make sure Docker Desktop is **running** before `run.bat`.

---

## `run.sh` / `run.bat` command reference

Both scripts are identical in behaviour (`run.sh` = Linux/macOS/WSL, `run.bat` =
Windows). Run from the repo root.

| Command | What it does |
|---------|--------------|
| `deps` | Check + install **all** prerequisites (Node, Docker, pnpm, Supabase CLI, Python). For a fresh machine. |
| _(none)_ / `all` | Full bootstrap **then** start web + api. |
| `setup` | Bootstrap only — install deps, start Postgres, create the RLS role, apply migrations, seed reference + demo data, run the RLS gate. No app start. |
| `start` | Start web + api (assumes `setup` already ran). |
| `studio` | Open the **DB admin UI** (Prisma Studio) at http://localhost:5555. Connects as the owner/superuser so it shows **all** tenants' data. |
| `test` | Run the analytics unit tests **and** the RLS tenant-isolation gate. |
| `reset` | **Destructive.** Drop + recreate the database, then re-seed. |
| `dump [file]` | **Export** the whole database → `backups/drilliq_<timestamp>.sql.gz` (or a path you give). |
| `restore <file>` | **Import / restore** a dump (**destructive** — replaces all data). |
| `stop` | Stop the Docker stack (`docker compose down`). |

What `setup`/`all` does, step by step:
1. Ensure prerequisites (auto-install missing Node/Docker).
2. `docker compose up -d db` and wait for the `drilliq-db` container to be healthy.
3. Create the restricted **`drilliq_app`** RLS role (non-owner, no `BYPASSRLS`).
4. `prisma migrate deploy` + `prisma generate` (build the client).
5. Seed reference vocabulary + demo tenants/users/wells.
6. Run the RLS isolation gate.

---

## Data: import & export

DrillIQ has **four** distinct import/export paths. The big one is full-database
backup/restore; the others move individual reports.

### 1. Full database backup & restore (whole DB, portable)

The most complete export — schema **and** all data, RLS policies, functions and
grants — as one gzipped SQL file. `pg_dump`/`psql` run **inside** the `postgres:16`
container, so a dump made on any OS restores identically on any other.

**Export (back up):**
```bash
./run.sh dump                       # → backups/drilliq_2026-06-19_2130.sql.gz
./run.sh dump my-backup.sql.gz      # or choose the path
#  Windows: run.bat dump
```

**Import (restore — replaces ALL current data):**
```bash
./run.sh restore backups/drilliq_2026-06-19_2130.sql.gz
#  Windows: run.bat restore <file>
```

Move the database to another machine:
```bash
# on the SOURCE machine
./run.sh dump
#   → copy the .sql.gz to the target machine (cloud drive / USB / scp)

# on the TARGET machine
./run.sh setup                                  # one-time: Docker + role + migrations
./run.sh restore backups/<that-file>.sql.gz
```

Details & guarantees:
- **OS-portable** in any direction (Windows ↔ Ubuntu ↔ macOS) — the dump is plain
  SQL produced by the same Postgres image everywhere.
- The dump is **self-cleaning** (`pg_dump --clean --if-exists`); restore first
  ensures the `drilliq_app` role exists so the dump's `GRANT`s apply, terminates
  stale connections, loads, then re-affirms grants. Idempotent.
- The restricted `drilliq_app` role itself is recreated by `setup`/`restore`, not
  carried inside the dump.
- Backups (`backups/`, `*.sql.gz`) are **git-ignored** — they hold real data, so
  move them out-of-band, not through GitHub.
- Round-trip verified: row counts, RLS policies and login all survive a dump→restore.

### 2. Import a Daily Drilling Report from PDF

Office Engineers can import a wellsite DDR PDF straight into the database.

- **UI:** log in as an Office Engineer → **Import DDR** tab (http://localhost:5173/import-ddr)
  → choose the PDF → **Parse / preview** (verify the extracted fields, no write) →
  **Import to database**.
- **API:**
  - `POST /api/ddr-import/parse` — multipart `file`; returns the parsed JSON only (no write).
  - `POST /api/ddr-import` — multipart `file`; parses **and persists**.
  - Both are `OFFICE_ENGINEER`-only; PDF-only; 25 MB cap.

What it extracts and writes (scoped to your tenant, inside the RLS transaction):
the **well** (upserted) + wellbore, a **DailyReport** (No., date, depths, status,
head count, hazards), the **24-hr activity log**, the **mud check**, and the
**bit run** (BitMaster + BitRun: size, model, IADC, make, serial, nozzles, TFA,
parameters). Re-importing the same well+date returns **409** (duplicate guard).

> The parser is tuned to the South Pars / WellView-style DDR template (see the
> committed sample PDFs). A different layout may extract partial fields — the
> Parse/preview step shows exactly what was read before you commit.

### 3. Report exports (PDF & Excel)

From the **Reports** tab (or directly via the API), generate branded exports,
**scoped to your client** (a contractor can never export another client's data):

| Endpoint | Output |
|----------|--------|
| `GET /api/reports/bit-runs.xlsx` | bit runs — Excel (ExcelJS) |
| `GET /api/reports/bit-runs.pdf` | bit runs — PDF (pdfkit) |
| `GET /api/reports/daily-reports.xlsx` | DDRs — Excel |

### 4. WITSML import / export

For interchange with other drilling systems (WITSML 1.4.x objects):

| Endpoint | Action |
|----------|--------|
| `GET /api/integrations/witsml/export` | emit DrillIQ data as WITSML XML |
| `POST /api/integrations/witsml/import` | ingest a WITSML document (idempotent, RLS-scoped) |

> **Legacy SQLite ETL** (`migration/etl.py`): a one-off loader that imported the
> historical NIDC drilling database into a separate `ddr-app` Supabase project.
> That target project has been retired; the script and its `migration/README.md`
> remain for reference only.

---

## Architecture

A pnpm-workspace monorepo, deployable via `docker compose`.

```
rop_report/
├── web/              Vite + React + TS SPA (TanStack Query/Table, Recharts, Plotly, Tailwind)
├── api/              NestJS REST + Swagger (JWT + RBAC, Prisma); capture, dashboard,
│                     plans, reports, integrations, rop, ddr-import modules
├── db/               Prisma schema + migrations (PostgreSQL + Row-Level Security) + seeds
├── ml/               Python FastAPI ROP-prediction service (DEFERRED — Phase 7 placeholder)
├── packages/shared/  @drilliq/shared — drilling analytics + Zod contracts (pure, unit-tested)
├── docs/             spec · domain-formulas · data-model · phases
├── run.sh / run.bat  one-command bootstrap, DB admin, backup/restore
└── backups/          gzipped DB dumps (git-ignored)
```

| Layer | Stack |
|-------|-------|
| Front end | Vite + React + TypeScript; TanStack Query/Table; Recharts (KPIs) + Plotly (cross-plots); React Hook Form + Zod; Tailwind; React Router. Responsive (mobile/tablet/desktop). |
| API | NestJS, `@nestjs/swagger`, JWT access+refresh, `RolesGuard` + `@Roles()` RBAC, Prisma, per-request RLS transaction. |
| Database | PostgreSQL 16 with **Row-Level Security**; UUID PKs; `client_id` leads every composite index. |
| Analytics | `@drilliq/shared` — pure, unit-tested formula functions. |
| ML | Python FastAPI (deferred — health placeholder only). |

### Database roles & connection

| Role | Use | Default password |
|------|-----|------------------|
| `drilliq` (owner, superuser) | migrations, seed, dump/restore, Prisma Studio — **bypasses RLS** | `change-me-in-prod` |
| `drilliq_app` (restricted, non-`BYPASSRLS`) | the running API — **RLS-enforced** | `change-me-app` |

DB: `postgresql://…@127.0.0.1:5432/drilliq` (use **127.0.0.1**, not `localhost` —
see [Troubleshooting](#troubleshooting)). Configure via `.env` (copy from
`.env.example`); 12-factor, no hard cloud dependency.

---

## Roles, logins & access

| Role | Capability | Scope |
|------|-----------|-------|
| **Management** | read-only dashboards, fleet KPIs, approvals/audit | all clients |
| **Office Engineer** | plans, bit programs, analytics, **DDR PDF import** | all (or assigned) clients |
| **Operation Engineer** | DDR + bit-run capture (incl. 8-position IADC dull grade) | wells they capture |
| **Contractor** | **read-only**, **own client's wells only** (RLS-enforced) | one tenant |

**Demo logins** (seeded; password `demo-password`):
`management@demo.drilliq`, `office@demo.drilliq`, `operation@demo.drilliq`,
`contractor-a@demo.drilliq` (tenant A), `contractor-b@demo.drilliq` (tenant B).

Auth: `POST /api/auth/login` returns access + refresh tokens; send
`Authorization: Bearer <access>`. Refresh rotates; logout invalidates.

### Contractor isolation (defense-in-depth)

1. **PostgreSQL RLS** — every client-scoped table has `ENABLE`/`FORCE ROW LEVEL
   SECURITY` with a `tenant_isolation` policy keyed on `app.current_client_id`,
   set per request via `SET LOCAL` inside a transaction. The app connects as a
   non-owner, non-`BYPASSRLS` role; a **fail-closed** accessor returns zero rows
   when no tenant is set.
2. **App-layer scoping** in the API.

Proven by `db/prisma/rls.test.ts` (`./run.sh test`): tenant A sees **zero** of
client B's wells; no tenant set ⇒ zero rows; `WITH CHECK` blocks cross-tenant writes.

---

## Working across two machines

Code syncs through GitHub; the database moves as a dump.

```bash
# PC #1 — push code, export the DB
git add -A && git commit -m "…" && git push
./run.sh dump                                  # backups/drilliq_<ts>.sql.gz  → copy to PC #2

# PC #2 — pull code, restore the DB
git pull
./run.sh setup
./run.sh restore backups/drilliq_<ts>.sql.gz
```

Schema changes: create migrations on one PC (`pnpm --filter @drilliq/db migrate`),
commit them, then on the other PC `git pull` + `./run.sh setup`. Always `git pull`
**before** creating a new migration so the two machines don't diverge.

---

## Domain analytics (`@drilliq/shared`)

All equations follow `docs/domain-formulas.md` exactly — **do not invent
formulas**. Inputs are in field/imperial units; depths are stored in **meters**
(SI) and converted at the formula/UI boundary.

| Metric | Formula |
|--------|---------|
| Bit area | `A_B = (π/4)·D_B²` |
| MSE (Teale 1965) | `WOB/A_B + (120·π·N·T)/(A_B·ROP)` |
| Sliding friction (Pessier/Fear) | `μ = 36·T/(D_B·WOB)` |
| TFA | `(π/4)·Σ(d_n/32)²` |
| Bit ΔP | `(MW·Q²)/(12031·Cd²·TFA²)` |
| HSI | `1.27·HHP_b/D_B²`, `HHP_b = P_bit·Q/1714` |
| Cost per foot | `C = [B + R·(t+T)]/F` — canonical fixture **$48.8/ft** |
| Founder point | ROP flattens vs WOB while MSE rises |

`pnpm --filter @drilliq/shared test` runs the unit tests pinned to the doc's
worked examples.

**ROP Optimization** (`/rop`) turns captured bit runs into a parameter-optimization
workbench: Summary KPIs, a **WOB×RPM contour** drill-off map with optimal-window
highlight, **MSE** power-law fit + founder curve, **Hydraulics** (HSI band),
**Economics** (cost-per-meter by bit type), plus scatter/by-size/table views.

---

## Development

```bash
pnpm install                          # workspace deps (pnpm via corepack)
pnpm dev                              # web + api in parallel (hot reload)
pnpm test                             # all workspace tests
pnpm typecheck                        # all packages
pnpm --filter @drilliq/api test       # API unit tests (jest)
pnpm --filter @drilliq/web test       # web tests (vitest)
pnpm db:migrate                       # apply migrations (dev)
pnpm db:seed                          # load reference + demo data
pnpm db:generate                      # regenerate the Prisma client
docker compose up -d                  # full stack (web, api, db, ml)
```

Seed reference vocabulary (contractors, mud types, hole/nozzle sizes, bit
makes/IADC codes, formations, …) lives in `db/seed-data/*.json`. The DDR-PDF
parser has a regression test (`api/src/ddr-import/ddr-parser.spec.ts`) over a
committed real-report fixture.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `unable to get image 'postgres:16-alpine' … dockerDesktopLinuxEngine: cannot find the file` | Docker Desktop isn't running. Start it, then re-run. |
| Prisma `P1001: can't reach database` | Use **127.0.0.1**, not `localhost` — on some Windows/WSL hosts `localhost` resolves to IPv6 `::1` which Docker's proxy doesn't serve. The `.env`/scripts already use `127.0.0.1`. |
| `prisma generate` → `EPERM … rename query_engine-windows.dll.node` | Another node process (a running dev server, IDE, or antivirus) holds the engine DLL on Windows. The scripts now **warn and continue** when a client already exists. For a clean regenerate, close stray `node.exe` (or reboot) and re-run `setup`. |
| `EADDRINUSE: :::3000` (or 5173) | An old dev server is still bound. Stop it (`run.sh stop`, or kill the process on that port) and restart. |
| Restore seems to do nothing | `restore` is destructive and replaces data; confirm you passed the right `.sql.gz` and that the `drilliq-db` container is healthy. |
| Contractor sees no data | Expected if pointed at the wrong tenant — RLS returns zero rows for other clients. Prisma Studio (`./run.sh studio`) connects as the owner and shows everything. |

---

## Build status

| Phase | Status |
|-------|--------|
| 0 — Foundations & spec | ✅ done |
| 1 — Data model & migrations + RLS | ✅ done |
| 2 — Auth & RBAC (JWT + RolesGuard + per-request RLS) | ✅ done |
| 3 — Capture (DDR + bit run) + **DDR-PDF import** | ✅ done |
| 4 — Analytics engine (formulas + tests) | ✅ done |
| 5 — Plan & analyze + Management dashboards | ✅ done |
| 6 — Reporting & exports (PDF/Excel) | ✅ done |
| 7 — ML ROP prediction | ⏸ deferred |
| 8 — Integrations (Entra ID SSO, WITSML, ERP) | ✅ done (scaffolded) |
| ROP Optimization workbench · responsive UI | ✅ done |

See `docs/phases.md` for the full plan and each phase's verification gate, and
`docs/spec.md`, `docs/domain-formulas.md`, `docs/data-model.md` for the
authoritative product, formula and schema references.

---

## License

Proprietary — © Magma Energy. All rights reserved.
