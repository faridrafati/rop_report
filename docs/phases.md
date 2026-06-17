# DrillIQ — BUILD PLAN (Phases 0–8)

> **DrillIQ** is a drill-bit performance & daily-drilling-report (DDR) analytics platform.
> This document is the authoritative, phase-by-phase build plan. Each phase has a
> **Goal**, concrete **Deliverables** (checklist), and an explicit **VERIFICATION GATE** —
> a *runnable* check that must pass before the phase is considered done.
>
> **Companion doc:** [`docs/domain-formulas.md`](./domain-formulas.md) is the authoritative
> formula reference. Implementations in `/api`, `/ml`, `/web` MUST match its equations,
> units, and worked examples exactly. The cost-per-foot **`$48.8/ft`** worked example is a
> canonical unit-test fixture.

## Status at a glance

| Phase | Title | Status |
|------:|-------|--------|
| 0 | Foundations & spec | 🟡 **IN PROGRESS** |
| 1 | Data model & migrations (+RLS) | ⬜ Not started |
| 2 | Auth & RBAC | ⬜ Not started |
| 3 | Capture (Operation Engineer) | ⬜ Not started |
| 4 | Analytics engine (pure formulas) | ⬜ Not started |
| 5 | Plan & analyze + Management dashboards | ⬜ Not started |
| 6 | Reporting & exports | ⬜ Not started |
| 7 | ML service (FastAPI) | ⛔ **DEFERRED** |
| 8 | Integrations (SSO, WITSML, ERP) | ⬜ Not started |

**Legend:** ✅ done · 🟡 in progress · ⬜ not started · ⛔ deferred

---

## Stack (decided — FOLLOW EXACTLY, do not substitute)

- **Monorepo:** pnpm workspaces — `/web`, `/api`, `/ml`, `/db`, `/docs`.
- **/web** — Vite + React + TypeScript SPA. TanStack Query + TanStack Table; Recharts for KPIs,
  Plotly for engineering cross-plots; React Hook Form + Zod; Tailwind/shadcn; React Router.
- **/api** — NestJS REST + `@nestjs/swagger`. JWT access + refresh; `RolesGuard` + `@Roles()` RBAC; Prisma ORM.
- **/db** — Prisma schema + migrations targeting **PostgreSQL** (NOT sqlite). Row-Level Security (RLS)
  for contractor isolation.
- **/ml** — Python FastAPI microservice (**DEFERRED** — placeholder only, no models this build).
- **docker-compose:** `web`, `api`, `db (postgres)`, `ml`. Deployable cloud or on-prem.

**Four roles (RBAC):** Management · Office Engineer · Operation Engineer · Contractor (read-only, OWN client's wells only).

---

## Phase 0 — Foundations & spec  🟡 IN PROGRESS

**Goal:** Stand up the monorepo skeleton, lock the stack, and capture the authoritative
domain spec (formulas, IADC dull-grade fields, WITSML alignment, reference vocabulary) so
every later phase has a single source of truth.

### Deliverables
- [x] pnpm workspace scaffold: `/web`, `/api`, `/db`, `/docs`, `/ml` (`pnpm-workspace.yaml`, root `package.json`).
- [x] `docker-compose.yml` with `web`, `api`, `db (postgres:16)`, `ml` services + healthchecks.
- [x] `.env.example` + `.gitignore`; 12-factor config (no hard cloud dependency).
- [x] `tsconfig.base.json` and per-package `tsconfig.json` (web/api).
- [x] `/api` NestJS scaffold with `@nestjs/swagger`, JWT, Passport deps wired.
- [x] `/web` Vite + React + TS scaffold with TanStack Query/Table, RHF+Zod, Recharts, Router, Tailwind.
- [x] `/ml` FastAPI placeholder (`app/main.py` health route, `pyproject.toml`, Dockerfile) — **no models**.
- [x] `docs/domain-formulas.md` — authoritative formula reference (MSE, friction, HHP/HSI, P_bit, TFA, cost/ft, founder).
- [x] `docs/phases.md` — **this build plan**.
- [x] Reference vocabulary extracted from `new.sqlite` into `/db/seed-data/*.json`
      (contractors, hole sizes, nozzle sizes, mud types, reason-pulled codes, well types/profiles, bit vocabulary, formations, lithology).
- [ ] `README.md` per package + root quickstart.
- [ ] CI workflow stub (`pnpm install && pnpm -r lint && pnpm -r test`).
- [ ] ADRs recorded: Postgres-over-sqlite, RLS-for-isolation, UUID PKs, `client_id` leading-column index rule, WITSML-shaped model.

### 🔒 VERIFICATION GATE — Phase 0
Runnable checks (all must succeed):
```bash
# 1. Workspace installs cleanly
pnpm install

# 2. Every package type-checks / lints
pnpm -r typecheck

# 3. Compose config is valid and all four services parse
docker compose config >/dev/null && echo "compose OK"

# 4. ML placeholder boots and answers health (no models loaded)
docker compose up -d ml && curl -fsS http://localhost:8000/health

# 5. Authoritative docs exist and contain the canonical fixture
test -f docs/domain-formulas.md && grep -q '48.8' docs/domain-formulas.md && echo "formulas OK"
test -f docs/phases.md && echo "phases OK"

# 6. Seed-data vocabulary is present and parses as JSON
for f in db/seed-data/*.json; do jq -e . "$f" >/dev/null; done && echo "seed-data JSON OK"
```
**Exit criteria:** install + typecheck pass; `docker compose config` validates 4 services; ML `/health` returns 200; both docs present; all seed-data JSON parses.

---

## Phase 1 — Data model & migrations (+RLS)  ⬜

**Goal:** A normalized, WITSML-aligned PostgreSQL schema with **UUID PKs**, contractor
**Row-Level Security**, and a realistic seed loaded from `/db/seed-data`.

### Deliverables
- [ ] Prisma schema (`/db/prisma/schema.prisma`) targeting **PostgreSQL** (provider = `postgresql`).
- [ ] Core entities with **UUID PKs**: `Client` (tenant, `client_id`), `Rig`, `Well` (`client_id`, field, spud, rig),
      `WellSection`/`HoleSize`, `Formation`/`Lithology`, `BitMaster`/inventory, `BitRun`, `DailyReport`/DDR,
      `Plan`/`Recommendation`, `User` (role + `client_id`), `AuditLog`, `Approval`.
- [ ] **WITSML-shaped** hierarchy: `Well → Wellbore → Trajectory (survey stations MD/inc/azm/TVD/NS/EW) → Log`;
      `DrillReport → {statusInfo, activity, bitRecord, fluid}`. `activity` carries IADC op code +
      Planned/Unplanned/Downtime + `productive` bool (→ NPT). `bitRecord` carries `condInit*`/`condFinal*` and `bitClass` (N/U).
- [ ] **IADC dull grade** modeled as 8 discrete fields, each with `condInit*` **and** `condFinal*`:
      (1) inner 0–8, (2) outer 0–8, (3) dull char (2-letter code), (4) location, (5) bearings/seals, (6) gauge, (7) other dull char, (8) reason pulled.
- [ ] **IADC bit classification** fields: roller-cone 4-char; fixed-cutter/PDC letter+3 digits (e.g. `M241`).
- [ ] `BitRun` carries parameters + dull grade + reason pulled + computed `MSE` + `costPerFoot` + `founder` flag (columns populated in Phase 4).
- [ ] **RLS migration** (raw SQL in a Prisma migration): enable RLS on every client-scoped table;
      policy `USING (client_id = current_setting('app.current_client_id')::uuid)`.
- [ ] **Index rule enforced:** `client_id` is the **LEADING column** in every composite index on client-scoped tables.
- [ ] Seed script (`/db/seed`) loads `/db/seed-data/*.json` reference vocab + a demo dataset: ≥2 `Client`s, wells per client, bit runs, DDRs.
- [ ] `pnpm db:migrate`, `pnpm db:generate`, `pnpm db:seed` wired in root `package.json` (already present — must run green).

### 🔒 VERIFICATION GATE — Phase 1
```bash
# 1. Migrations apply cleanly to a fresh Postgres
docker compose up -d db
pnpm db:migrate           # prisma migrate deploy/dev — exits 0
pnpm db:generate          # prisma client generates

# 2. Seed loads without error
pnpm db:seed              # exits 0, reports rows inserted

# 3. RLS is actually ON for client-scoped tables (no table with rowsecurity=false)
psql "$DATABASE_URL" -tAc \
  "SELECT count(*) FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename
   WHERE t.schemaname='public' AND t.tablename IN ('well','bit_run','daily_report')
   AND c.relrowsecurity = false;"   # MUST print 0

# 4. client_id is the leading index column on client-scoped tables (manual/asserted in test)
psql "$DATABASE_URL" -c "\d+ well" | grep -i index   # first key col = client_id
```
**RLS zero-rows proof (also runs here, fully exercised in Phase 2):**
```sql
BEGIN;
SET LOCAL app.current_client_id = '<client-B-uuid>';
SELECT count(*) FROM well WHERE id = '<a-client-A-well-uuid>';  -- MUST return 0
ROLLBACK;
```
**Exit criteria:** migrations apply on fresh DB; seed loads; RLS-off count = 0; `client_id` leads composite indexes; cross-client SELECT under `SET LOCAL` returns 0 rows.

---

## Phase 2 — Auth & RBAC  ✅

**Goal:** JWT access+refresh auth, four-role `RolesGuard`, and **enforced contractor isolation**
combining Postgres RLS (`SET LOCAL` per request transaction) with app-layer scoping.

### Deliverables
- [ ] Auth module: login → JWT **access + refresh**; refresh-token rotation; logout.
- [ ] `User` carries `role ∈ {Management, OfficeEngineer, OperationEngineer, Contractor}` + `client_id` (Contractor/owner scope).
- [ ] `RolesGuard` + `@Roles()` decorator enforcing route-level RBAC.
- [ ] **Per-request transaction interceptor**: opens a tx and runs `SET LOCAL app.current_client_id = '<jwt.client_id>'`
      so RLS is active for every DB call in the request.
- [ ] App-layer scoping (defense in depth): Contractor queries always filtered by their `client_id`.
- [ ] Contractor is **read-only** (write routes blocked by `RolesGuard`).
- [ ] Swagger documents auth schemes + role requirements per endpoint.
- [ ] Seeded users: one per role; two contractors bound to two different clients.

### 🔒 VERIFICATION GATE — Phase 2
```bash
pnpm --filter @drilliq/api test    # includes the RLS + RBAC e2e suite below
```
Mandatory automated tests (must pass):
- [ ] **RLS ZERO-ROWS TEST (canonical):** A Contractor token for **Client B** requests a **Client A** well
      → API returns `403`/`404` **and** the underlying SQL returns **0 rows**. This is the headline isolation proof.
- [ ] Contractor can read **only** their own client's wells (count matches seed for own client; 0 for others).
- [ ] Contractor write attempt (POST/PUT/DELETE) → `403`.
- [ ] Operation Engineer can write capture endpoints; cannot reach Management-only routes.
- [ ] Access token expiry → refresh issues a new access token; rotated refresh invalidates the old.
- [ ] Missing/invalid/expired JWT → `401`.

**Exit criteria:** full API test suite green, with the Contractor-cross-client query proven to return **zero rows**.

---

## Phase 3 — Capture (Operation Engineer)  ⬜

**Goal:** Field-data capture UI + API for the Operation Engineer: **bit-run**, the full
**8-field IADC dull grade**, **dysfunction flags**, and the **Daily Drilling Report (DDR)**.

### Deliverables
- [ ] **Bit-run capture** form (RHF + Zod): bit selection from `BitMaster`, hole size, depth in/out, footage,
      drilling parameters (WOB, RPM, torque, flow `Q`, MW, nozzle/TFA), rotating/trip hours, reason pulled.
- [ ] **8-field dull grade** capture as discrete fields, `condInit*` + `condFinal*` (WITSML-style):
      inner (0–8), outer (0–8), dull char (2-letter dropdown: `BC BT BU CC CD CI CR CT ER FC HC JD LC LN LT NO NR OC PB PN RG RO RR SD SS TR WO WT BF`),
      location, bearings/seals, gauge, other dull char, reason pulled (`BHA CM CP DMF DP DSF DST DTF FM HP HR LIH LOG PP PR RIG TD TQ TW WO`).
- [ ] **Dysfunction flags**: stick-slip, whirl, bit bounce, bit balling (with mitigation hints per `domain-formulas.md`).
- [ ] **DDR capture**: status info, activities (IADC op code + Planned/Unplanned/Downtime + `productive` → NPT), fluids (MW, PV, YP, gels, pH, ECD), costs, personnel, incidents.
- [ ] Zod schemas shared/mirrored with NestJS DTOs (`class-validator`); server-side validation enforced.
- [ ] TanStack Table list views for bit runs and DDRs (filter by well/section/date), scoped by role.
- [ ] All capture writes audited to `AuditLog`; Operation Engineer role gated via `@Roles()`.

### 🔒 VERIFICATION GATE — Phase 3
```bash
pnpm --filter @drilliq/web test
pnpm --filter @drilliq/api test
```
- [ ] **Swagger generates** and documents all capture endpoints with DTO schemas:
      `curl -fsS http://localhost:3000/api-json | jq -e '.paths["/bit-runs"], .paths["/daily-reports"]'`.
- [ ] Round-trip test: POST a bit run with all 8 dull-grade fields (init+final) → GET returns identical values.
- [ ] Validation test: invalid dull char (e.g. `ZZ`) or out-of-range inner (`9`) → `400`.
- [ ] NPT derivation: a Downtime/`productive=false` activity is flagged NPT in the persisted DDR.
- [ ] Dysfunction flags persist and surface in the bit-run detail view.
- [ ] **Screenshot match:** bit-run capture form + DDR form render correctly (visual snapshot vs. baseline).

**Exit criteria:** capture forms render & validate, full 8-field dull grade round-trips, Swagger documents endpoints, web+api tests green.

---

## Phase 4 — Analytics engine (pure, unit-tested formula functions)  ⬜

**Goal:** A **pure** TypeScript analytics library (no I/O, no DB) implementing every equation in
`domain-formulas.md` exactly, with comprehensive unit tests including the canonical fixtures.

### Deliverables
- [ ] Pure functions (typed, side-effect-free), units documented in signatures:
  - [ ] `mse(WOB, A_B, N, T, ROP)` — Teale 1965: `MSE = WOB/A_B + (120·π·N·T)/(A_B·ROP)` (psi); `A_B = (π/4)·D_B²` (in²).
  - [ ] `slidingFriction(T, D_B, WOB)` — Pessier/Fear: `μ = 36·T/(D_B·WOB)` (dimensionless).
  - [ ] `hhpBit(P_bit, Q)` — `HHP_b = (P_bit·Q)/1714`; `hsi(HHP_b, D_B)` — `HSI = 1.27·HHP_b/D_B²` (optimum 2.5–5.0).
  - [ ] `pBit(MW, Q, TFA)` — `P_bit = (MW·Q²)/(12031·0.95²·TFA²)` (Cd=0.95).
  - [ ] `tfa(nozzles[])` — `TFA = (π/4)·Σ(d_n/32)²` (d_n in 32nds).
  - [ ] `costPerFoot(B, R, t, T, F)` — `C = [B + R·(t+T)]/F`.
  - [ ] `effectiveRop(footage, rotating, trip, flat)` — `footage/(rotating+trip+connection/flat)`.
  - [ ] `founderPoint(samples[])` — map WOB-vs-ROP and RPM-vs-ROP; flag founder when MSE rises while ROP flattens.
  - [ ] `mseEfficiency(...)` — flag ~35% "good drilling" reference.
- [ ] Dysfunction classifier helpers (stick-slip / whirl / bit bounce / balling) from parameter trends.
- [ ] API endpoints expose analytics over stored bit-runs/DDRs (delegating to the pure lib).
- [ ] Shared types so `/web` cross-plots (Plotly) consume the same lib output.

### 🔒 VERIFICATION GATE — Phase 4
```bash
pnpm --filter @drilliq/api test    # (or the analytics package's own vitest/jest)
```
Mandatory unit-test fixtures (must pass exactly):
- [ ] **COST-PER-FOOT = `$48.8/ft`** — `costPerFoot(B=27000, R=3500, t=50, T=12, F=5000) ≈ 48.8` (assert within tolerance).
- [ ] `tfa([...])` and `pBit(...)` reproduce the worked examples in `domain-formulas.md`.
- [ ] `mse(...)` reproduces a known psi result; `slidingFriction(...)` reproduces a known μ.
- [ ] `hhpBit/hsi` reproduce worked HSI in the 2.5–5.0 optimum band for a known input.
- [ ] `founderPoint(...)` flags a synthetic dataset where ROP flattens while MSE rises.
- [ ] Property checks: zero/negative guards, unit consistency, NaN-free outputs.

**Exit criteria:** every formula has a passing unit test; the **$48.8/ft** fixture is green; all functions are pure (no DB/network in the analytics module).

---

## Phase 5 — Plan & analyze (Office Engineer) + Management dashboards  ⬜

**Goal:** Office Engineer planning/recommendation workflows and Management KPI dashboards,
both consuming the Phase-4 analytics engine.

### Deliverables
- [ ] **Office Engineer** plan workflow: create `Plan`/`Recommendation` (bit selection, parameter targets,
      offset-well comparison), `Approval` flow, versioning, audit.
- [ ] Engineering **cross-plots (Plotly)**: WOB-vs-ROP, RPM-vs-ROP, MSE overlay with **founder-point flagging**;
      HSI/hydraulics; depth-vs-time.
- [ ] **Management dashboards (Recharts KPIs)**: cost-per-foot trends, NPT %, footage/day, MSE efficiency,
      bit performance leaderboards, fleet/field roll-ups.
- [ ] Filters by client/field/well/section/contractor/date; drill-down to bit-run & DDR detail.
- [ ] Role gating: Office Engineer authoring; Management read across own org; Contractor read-only own client.

### 🔒 VERIFICATION GATE — Phase 5
```bash
pnpm --filter @drilliq/web test
pnpm --filter @drilliq/api test
```
- [ ] Dashboard KPI values equal analytics-lib output for a seeded dataset (no recomputation drift).
- [ ] Founder-point cross-plot renders flagged points for the synthetic founder dataset.
- [ ] Plan → Approval state machine transitions tested (draft → submitted → approved/rejected); audited.
- [ ] **Screenshot match:** Management dashboard and Office Engineer plan view vs. baseline snapshots.
- [ ] RBAC: Office Engineer cannot approve own plan if policy forbids; Contractor sees read-only dashboards scoped to own client.

**Exit criteria:** dashboards show correct (lib-derived) KPIs, founder plots flag correctly, plan/approval workflow tested, screenshots match.

---

## Phase 6 — Reporting & exports (contractor-scoped)  ⬜

**Goal:** Generate polished PDF reports (Puppeteer) and Excel workbooks (ExcelJS), with all
exports **contractor-scoped** so a Contractor can only export their own client's data.

### Deliverables
- [ ] **Puppeteer PDF** rendering of DDR, bit-run report, and dashboard summaries (server-side, headless).
- [ ] **ExcelJS** workbook exports (bit runs, DDR activities/NPT, cost-per-foot, KPI tables) with formatting.
- [ ] Export endpoints honor RLS + app-layer scoping → **contractor cannot export another client's data**.
- [ ] Report templates branded; embed analytics (MSE, cost/ft, founder flags) from Phase-4 lib.
- [ ] Async/streamed generation for large datasets; downloads audited to `AuditLog`.

### 🔒 VERIFICATION GATE — Phase 6
```bash
pnpm --filter @drilliq/api test
```
- [ ] PDF generation test: Puppeteer produces a non-empty, valid PDF for a seeded DDR (assert header bytes `%PDF`).
- [ ] Excel test: ExcelJS workbook opens, expected sheets/columns present, **cost-per-foot cell = `$48.8/ft`** for the fixture run.
- [ ] **Contractor-scope export test:** Contractor (Client B) requesting an export covering Client A data → `403`/empty + **0 rows** in payload.
- [ ] Export download recorded in `AuditLog`.

**Exit criteria:** valid PDF + Excel produced from real data, cost/ft fixture appears correctly in export, contractor scoping proven on exports.

---

## Phase 7 — ML service (FastAPI)  ⛔ DEFERRED

> **STATUS: DEFERRED.** This phase is **not** built in the current effort. `/ml` ships as a
> **placeholder FastAPI service only** (health route, Dockerfile, deps) — **no models, no training,
> no inference endpoints**. Documented here so the contract and roadmap are explicit.

**Goal (future):** FastAPI microservice for predictive analytics — Random Forest, SVM, KNN,
Neural Network, and regression models (e.g., ROP prediction, dull-grade / reason-pulled
classification, bit-life / cost-per-foot estimation).

### Deliverables (future — NOT in scope now)
- [ ] FastAPI inference endpoints behind `ML_BASE_URL` (already wired in compose/api env).
- [ ] Models: RF / SVM / KNN / NN / regression with persisted artifacts + versioning.
- [ ] Training pipeline + feature store sourced from `/db` (read-only, scoped).
- [ ] Model cards, evaluation metrics, drift monitoring.

### 🔒 VERIFICATION GATE — Phase 7 (current scope only)
```bash
docker compose up -d ml && curl -fsS http://localhost:8000/health   # placeholder responds 200
pytest ml/tests   # only the health test exists; no model tests this build
```
**Exit criteria (this build):** placeholder `/health` returns 200; **no model code shipped**. Full gate (model accuracy thresholds, inference latency) is deferred.

---

## Phase 8 — Integrations (Entra ID SSO, WITSML, ERP)  ⬜

**Goal:** Enterprise integrations layered onto the WITSML-shaped model: Entra ID (Azure AD)
SSO, WITSML import/export, and ERP connectors.

### Deliverables
- [ ] **Entra ID (Azure AD) SSO** via OIDC; map IdP groups → DrillIQ roles + `client_id`; keep local JWT for service calls.
- [ ] **WITSML import**: ingest `well → wellbore → trajectory → log` and `drillReport`/`bitRecord`/`fluid`
      into DrillIQ entities (Phase-1 model already WITSML-shaped; WITSML 2.0 `BhaRun` mapping for bit runs).
- [ ] **WITSML export**: emit DrillIQ data as WITSML objects (round-trip safe).
- [ ] **ERP connectors**: cost/AFE and inventory sync (bit master / costs), scoped per client.
- [ ] Integration audit + error handling + idempotent re-imports.

### 🔒 VERIFICATION GATE — Phase 8
```bash
pnpm --filter @drilliq/api test
```
- [ ] SSO login test: OIDC flow (mocked IdP) issues a session; IdP group → correct role + `client_id`.
- [ ] WITSML round-trip: import a sample WITSML doc → export → re-import yields equivalent data (no loss).
- [ ] Imported data respects RLS — contractor still sees only own client's imported wells (**0 rows** cross-client).
- [ ] ERP sync test: cost/inventory record syncs and reconciles; idempotent on re-run.

**Exit criteria:** SSO maps roles/clients correctly, WITSML import/export round-trips losslessly under RLS, ERP sync is idempotent and scoped.

---

## Cross-cutting verification (every phase)
- [ ] `pnpm install && pnpm -r typecheck && pnpm -r lint` green.
- [ ] `pnpm -r test` green.
- [ ] `docker compose config` validates; affected services boot via healthchecks.
- [ ] No regression in the **RLS zero-rows** isolation proof.
- [ ] No regression in the **cost-per-foot = `$48.8/ft`** unit-test fixture.
- [ ] Swagger (`/api-json`) generates without error for all current endpoints.
