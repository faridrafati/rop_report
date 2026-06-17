# DrillIQ — Drill-Bit Performance & DDR Analytics Platform

Login-gated internal platform for drilling-bit performance analysis and daily drilling
reports (DDR). Monorepo (pnpm workspaces). Deployable on-prem or cloud.

- `web/` — Vite + React + TypeScript SPA (`@drilliq/web`): TanStack Query/Table, Recharts (KPIs) + Plotly (engineering cross-plots), React Hook Form + Zod, Tailwind, React Router.
- `api/` — NestJS REST + Swagger (`@drilliq/api`): JWT access+refresh, `RolesGuard` + `@Roles()` RBAC, Prisma.
- `db/`  — Prisma schema + migrations on **PostgreSQL** (`@drilliq/db`); Row-Level Security for contractor isolation; seeds from `db/seed-data/`.
- `ml/`  — Python FastAPI ROP-prediction service. **DEFERRED to Phase 7** — placeholder only.
- `docs/` — spec, formulas, data model, build plan (see imports below).

## Commands
- `pnpm dev` — run web + api in parallel.
- `pnpm test` — run all workspace tests. **Required before commit.**
- `pnpm lint` / `pnpm typecheck` — must pass before commit.
- `pnpm db:migrate` — apply Prisma migrations; `pnpm db:seed` — load reference + demo data.
- `pnpm db:generate` — regenerate Prisma client.
- `pnpm compose:up` / `pnpm compose:down` — full docker stack (web, api, db, ml).
- ML service: `cd ml && uvicorn app.main:app --reload`.

## Architecture
- **Four roles** (RBAC): Management, Office Engineer, Operation Engineer, Contractor (read-only, OWN client's wells only).
- **Core loop**: Plan → Execute & capture → Analyze → Report.
- **Spine**: Client → Well → Wellbore → WellSection → BitRun; DailyReport (DDR) links to wells/bit-runs. WITSML-aligned (`drillReport`, `bitRecord`, `activity`, `fluid`, `trajectory`).
- **Contractor isolation** = Postgres RLS + app-layer scoping. The API connects as a non-owner, non-BYPASSRLS role and sets `app.current_client_id` via `SET LOCAL` inside a per-request transaction. Policy: `USING (client_id = current_setting('app.current_client_id')::uuid)`.
- Analytics formulas live in `@docs/domain-formulas.md` — the authoritative source.
- Data model in `@docs/data-model.md` (WITSML-aligned, grounded in real NIDC reference data).
- Reference/seed vocabulary in `db/seed-data/*.json` (contractors, reason-pulled, mud types, hole/nozzle sizes, bit makes/IADC codes, casing, formations) extracted from the legacy NIDC drilling DB.

## Hard rules
- **YOU MUST** scope every Contractor query by `client_id` AND rely on RLS as defense-in-depth. `client_id` MUST be the **leading column** of every composite index on a client-scoped table (RLS is ~100× slower otherwise). UUID PKs only — never sequential ints.
- **YOU MUST** keep a test proving a Contractor token returns **zero rows** for another client's well.
- **DO NOT invent formulas.** Use the exact equations and units in `@docs/domain-formulas.md`:
  - MSE = WOB/A_B + (120·π·N·T)/(A_B·ROP)  (Teale 1965; A_B = (π/4)·D_B²).
  - HSI = 1.27·HHP_b/D_B²;  HHP_b = (P_bit·Q)/1714.
  - Cost/foot: C = [B + R·(t + T)] / F  (worked fixture: B=27000, t=50, R=3500, T=12, F=5000 → **$48.8/ft** — keep as a unit test).
- Analytics functions are **pure and unit-tested** (test against the worked examples in the formula doc).
- **Units**: store depths in **meters** internally, convert at UI. Timestamps **UTC**. Money in a single configured currency.
- Capture all **8 IADC dull-grade positions** as discrete fields (init + final), per the formula doc.
- API: validate every DTO (class-validator); throw typed exceptions with codes, never raw `Error`. Use named exports.
- ML stays in `ml/` (FastAPI). Do NOT shoehorn ML into the Node API.

## Workflow
- **Explore → Plan → Code → Commit.** Skip planning only if the diff fits in one sentence.
- Write tests with each module; commit per task step.
- Each phase must end **verifiable** (migrations apply, seed loads, tests pass, Swagger generates, RLS zero-rows test). See `@docs/phases.md`.
- Current status: **Phase 0 (Foundations) complete**; Phase 1 (data model & migrations) next. ML deferred.

## Imports
@docs/spec.md
@docs/domain-formulas.md
@docs/data-model.md
@docs/phases.md
