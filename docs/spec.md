# DrillIQ — Product Specification

> **Status:** Authoritative product spec. This document defines *what* DrillIQ is and *what it must do*.
> Companion docs (do not duplicate — reference them):
> - Formulas & units: [`docs/domain-formulas.md`](./domain-formulas.md) — authoritative for every equation, constant, and unit convention.
> - Data model: [`docs/data-model.md`](./data-model.md) — authoritative entity catalogue (WITSML-aligned, PostgreSQL).
> - Build plan & verification gates: [`docs/phases.md`](./phases.md) — authoritative phase-by-phase plan.
> - Operating rules for contributors: [`CLAUDE.md`](../CLAUDE.md).

---

## 1. Overview & vision

**DrillIQ** is a login-gated, internal **drill-bit performance and Daily Drilling Report (DDR)
analytics platform**. It gives an oil & gas operator — and the drilling contractors it works with —
one place to **plan** bit and parameter selection, **capture** what actually happened at the rig,
**analyze** drilling efficiency, and **report** results to engineering and management.

### Who uses it

- **Drilling / office engineers** at the operator — plan sections, pick bits, set parameter targets,
  compare offset wells, and review plan-vs-actual.
- **Operation (rig / wellsite) engineers** — capture bit runs, IADC dull grades, dysfunction flags,
  and the daily drilling report at the wellsite.
- **Management** at the operator — read-only executive dashboards across the fleet.
- **Contractors** (drilling service companies) — read-only access to **their own** wells' reports and exports.

### Why it exists (value)

- **Analyze bit performance across wells** — compare runs, bits, makes/IADC classes, sections, and fields
  on common metrics instead of scattered spreadsheets.
- **Optimize ROP** — surface drilling dysfunction (founder, stick-slip, whirl, bit bounce, balling) from
  parameter trends so engineers can adjust before footage and bits are wasted.
- **Reduce cost-per-foot** — make the true economics of each run visible and comparable, driving better
  bit and parameter decisions.
- **Standardize DDR capture** — a single, validated, WITSML-shaped schema for daily activities, fluids,
  costs, and the full 8-position IADC dull grade, replacing inconsistent free-form reporting.

DrillIQ is deployable **on-prem or in the cloud** (12-factor config, docker-compose). It is multi-tenant:
multiple clients coexist, and **contractor data is strictly isolated** (see §7).

---

## 2. Technology stack (decided)

The stack below is **decided** — follow it exactly; do not substitute. It mirrors
[`CLAUDE.md`](../CLAUDE.md) and [`docs/phases.md`](./phases.md#stack-decided--follow-exactly-do-not-substitute).

**Monorepo:** pnpm workspaces — `web/`, `api/`, `db/`, `ml/`, `docs/`.

| Workspace | Package | Stack | Responsibility |
|-----------|---------|-------|----------------|
| `web/` | `@drilliq/web` | **Vite + React + TypeScript** SPA. TanStack Query + TanStack Table; **Recharts** (KPI dashboards) + **Plotly** (engineering cross-plots); React Hook Form + Zod; Tailwind; React Router. | All user-facing UI: capture forms, planning, analytics, dashboards. |
| `api/` | `@drilliq/api` | **NestJS** REST + `@nestjs/swagger`. **JWT access + refresh**; `RolesGuard` + `@Roles()` RBAC; **Prisma** ORM. | Auth, RBAC, business logic, analytics endpoints, exports. |
| `db/` | `@drilliq/db` | **Prisma schema + migrations** on **PostgreSQL**; **Row-Level Security (RLS)** for contractor isolation; seeds from `db/seed-data/`. | Schema, migrations, RLS policies, reference/demo seed data. |
| `ml/` | (Python) | **Python FastAPI** ROP-prediction microservice. | **DEFERRED to Phase 7** — placeholder health service only this build. |
| `docs/` | — | Markdown specs. | This spec, formulas, data model, build plan. |

**Containerization & deployment:** `docker-compose` runs `web`, `api`, `db (postgres)`, and `ml`.
Configuration is **12-factor** (environment variables, `.env.example` provided) with **no hard
dependency on any cloud provider** — the same stack runs on-prem or in any cloud.

**Key architectural decisions:**
- **UUID primary keys** everywhere (never sequential integers).
- **Contractor isolation** is Postgres RLS *plus* app-layer scoping (see §7).
- Analytics are implemented as a **pure, unit-tested** TypeScript library (no I/O), tested against the
  worked examples in [`docs/domain-formulas.md`](./domain-formulas.md).
- The ML service stays in `ml/` (FastAPI) — it is **not** shoehorned into the Node API.

---

## 3. Roles & RBAC

DrillIQ has **exactly four roles**. RBAC is enforced at the API via `RolesGuard` + `@Roles()`, and the
Contractor boundary is additionally enforced at the database via RLS (§7). Roles are also reflected in
the UI (routes and actions a role cannot use are hidden/disabled).

| Role | Who they are | What they can DO | What they can SEE (scope) |
|------|--------------|------------------|---------------------------|
| **Management** | Operator leadership / drilling managers. | **Read-only.** View executive dashboards & fleet KPIs; cross-well and cross-bit comparisons; approvals & audit views (governance oversight). No data entry. | **All clients** in the operator org. Fleet/field/well/bit roll-ups and drill-downs. |
| **Office Engineer** | Operator drilling/planning engineers. | **Planning & analytics (author).** Offset-well search; create bit & parameter **recommendations per section** (`Plan` / `Recommendation`); run plan-vs-actual; use all analytics & cross-plots; submit plans into the approval flow. | **All clients** (or only **assigned** clients, per deployment policy). |
| **Operation Engineer** | Wellsite / rig engineers. | **Capture (author).** Enter **bit runs** (parameters + the full **8-position IADC dull grade**, init + final, + **dysfunction flags**); enter the **DDR** (status, activities, fluids, costs, personnel, incidents); record daily fluids/activities/costs. | The wells/sections they capture for (per deployment policy); their own captured records and the analytics over them. |
| **Contractor** | External drilling service company. | **READ-ONLY.** View their own wells' bit runs, DDRs, and dashboards; **export** their own wells' reports (PDF/Excel). No create/update/delete. | **OWN client's wells ONLY** — enforced by **Postgres RLS + app-layer scoping** (defense in depth). Zero visibility into any other client. |

**Hard RBAC rules** (see also [`CLAUDE.md`](../CLAUDE.md#hard-rules)):
- Contractor is **strictly read-only** — every write route is blocked by `RolesGuard`.
- Every Contractor query is scoped by `client_id` in the app layer **and** protected by RLS.
- A regression test must always prove a Contractor token returns **zero rows** for another client's well
  (the canonical isolation proof — see §7 and [Phase 2 gate](./phases.md#phase-2--auth--rbac-)).

---

## 4. The core loop: Plan → Execute & capture → Analyze → Report

DrillIQ is organized around a single repeating loop. Each stage is driven by a primary role and feeds
the next.

| Stage | Primary role | What happens |
|-------|--------------|--------------|
| **1. Plan** | Office Engineer | Search **offset wells**, choose a bit and parameter targets per section, and record a `Plan` / `Recommendation`. Plans move through an **approval** flow. |
| **2. Execute & capture** | Operation Engineer | At the rig, capture the **bit run** (drilling parameters, the 8-position IADC dull grade init+final, dysfunction flags, reason pulled) and the **DDR** (activities → NPT, fluids, costs, incidents). |
| **3. Analyze** | Office Engineer (authoring) · Management (oversight) | Compute MSE, hydraulics (HSI/HHP), cost-per-foot, effective ROP, and **founder-point** detection over captured runs. Compare **plan vs. actual** and across wells/bits/sections. |
| **4. Report** | All (scoped) | Render polished **PDF** (Puppeteer) and **Excel** (ExcelJS) reports and dashboards. Contractors export **their own** data only; Management reviews fleet KPIs. |

The loop closes: analysis and reporting feed the next plan (better bit/parameter choices), continuously
driving ROP up and cost-per-foot down.

> Formulas behind the **Analyze** stage live in [`docs/domain-formulas.md`](./domain-formulas.md):
> MSE (Teale 1965), HSI/HHP, **cost-per-foot** `C = [B + R·(t + T)] / F`, effective ROP, and the
> **founder point** model. The canonical cost-per-foot fixture (`B=27000, t=50, R=3500, T=12, F=5000 →
> $48.8/ft`) is a unit-test invariant — see the formula doc and [Phase 4 gate](./phases.md#phase-4--analytics-engine-pure-unit-tested-formula-functions-).

---

## 5. Key user journeys

### Management
- **Fleet health check.** Logs in to the executive dashboard, sees cost-per-foot trends, NPT %, footage/day,
  and MSE-efficiency KPIs across all clients/fields; drills from a field roll-up down to a single underperforming
  bit run.
- **Bit leaderboard.** Compares bit makes / IADC classes across wells to see which bits deliver the best
  cost-per-foot in a given formation; uses this to challenge or endorse engineering recommendations.
- **Governance.** Reviews the **approval** state of recent plans and the **audit** trail of who changed what.

### Office Engineer
- **Plan a section.** Searches offset wells for the target field/formation, reviews their bit runs and ROP,
  and creates a `Recommendation` (bit selection + WOB/RPM/flow targets) for the upcoming section; submits the
  `Plan` for approval.
- **Plan vs. actual.** After the section is drilled, overlays planned parameters against captured bit-run data
  and MSE/founder cross-plots (Plotly) to see where the rig deviated and why.
- **Diagnose a dysfunction.** Opens WOB-vs-ROP and RPM-vs-ROP cross-plots; spots a **founder point** (MSE rising
  while ROP flattens) and updates the next recommendation to back off the offending parameter.

### Operation Engineer
- **Log a bit run.** At the wellsite, selects the bit from `BitMaster`, enters hole size, depth in/out, footage,
  drilling parameters (WOB, RPM, torque, flow `Q`, MW, nozzles/TFA), rotating/trip hours, reason pulled, the full
  **8-position IADC dull grade** (init + final), and any **dysfunction flags**; saves and the run is audited.
- **File the daily DDR.** Enters the day's status, activities (each tagged with IADC op code +
  Planned/Unplanned/Downtime + `productive` → NPT), fluid checks (MW, PV, YP, gels, pH, ECD), costs, personnel,
  and incidents. Validation rejects bad codes (e.g. an invalid dull char) before save.

### Contractor
- **Review own wells.** Logs in and sees **only** their own client's wells; opens a well's bit runs and DDRs to
  review performance — attempting to reach any other client's record returns nothing (RLS-enforced).
- **Export a report.** Generates a branded **PDF** DDR / bit-run report or an **Excel** workbook of their own
  wells; the export is scoped so it can never include another client's data, and the download is audited.

---

## 6. Feature list by build phase

This is the feature roadmap. The **detailed deliverables and runnable verification gates** for every phase
are in [`docs/phases.md`](./phases.md) — cross-reference it; this list does not restate the gates.

| Phase | Title | Status | Headline features |
|------:|-------|--------|-------------------|
| **0** | Foundations & spec | ✅ **done** (gate pending finalization) | pnpm monorepo scaffold (`web`/`api`/`db`/`ml`/`docs`); docker-compose (4 services); 12-factor `.env`; NestJS + Swagger/JWT scaffold; Vite/React scaffold; FastAPI placeholder; authoritative docs (this spec, formulas, data model, phases); reference vocabulary seeds from legacy NIDC DB. |
| **1** | Data model & migrations (+RLS) | ⬜ | Prisma/PostgreSQL schema (UUID PKs); WITSML-shaped hierarchy `Well → Wellbore → Trajectory → Log`, `DrillReport → {statusInfo, activity, bitRecord, fluid}`; **8-field IADC dull grade** (init+final) + IADC bit classification; **RLS** policies; `client_id` leading-column index rule; reference + demo seed (≥2 clients). |
| **2** | Auth & RBAC | ⬜ | Login + **JWT access/refresh** (rotation, logout); four-role `RolesGuard` + `@Roles()`; **per-request transaction** sets `app.current_client_id` so RLS is active; app-layer scoping; **Contractor read-only**; canonical **RLS zero-rows** isolation test. |
| **3** | Capture (Operation Engineer) | ⬜ | Bit-run capture (parameters, dull grade init+final, dysfunction flags, reason pulled); **DDR** capture (status, activities→NPT, fluids, costs, personnel, incidents); shared Zod ↔ class-validator validation; TanStack Table list views; all writes audited. |
| **4** | Analytics engine | ⬜ | **Pure, unit-tested** formula library: MSE, sliding friction, HHP/HSI, P_bit, TFA, **cost-per-foot**, effective ROP, **founder point**, MSE efficiency, dysfunction classifiers — per [`domain-formulas.md`](./domain-formulas.md); analytics API endpoints. Canonical **$48.8/ft** fixture. |
| **5** | Plan & analyze + Management dashboards | ⬜ | Office Engineer `Plan`/`Recommendation` + **approval** flow + versioning; offset-well comparison; **Plotly cross-plots** (WOB/RPM-vs-ROP, MSE overlay, founder flagging, hydraulics, depth-vs-time); **Recharts** Management KPI dashboards; role-gated filters & drill-down. |
| **6** | Reporting & exports | ⬜ | **Puppeteer PDF** (DDR, bit-run, dashboard summaries); **ExcelJS** workbooks; exports honor RLS + scoping (**contractor cannot export another client's data**); async generation; downloads audited. |
| **7** | ML service (FastAPI) | ⛔ **DEFERRED** | Future predictive analytics (ROP prediction, dull-grade/reason-pulled classification, bit-life/cost estimation: RF/SVM/KNN/NN/regression). This build ships a **placeholder `/health` service only — no models**. |
| **8** | Integrations | ⬜ | **Entra ID (Azure AD) SSO** via OIDC (IdP groups → roles + `client_id`); **WITSML** import/export (round-trip safe); **ERP** connectors (cost/AFE, inventory) — all scoped per client and audited. |

> **Legend:** ✅ done · 🟡 in progress · ⬜ not started · ⛔ deferred.
> Current status mirrors [`docs/phases.md`](./phases.md#status-at-a-glance): **Phase 0 foundations complete**,
> Phase 1 next, ML (Phase 7) deferred.

---

## 7. Non-functional requirements

### Security & access control (RBAC)
- Four roles, enforced at the API (`RolesGuard` + `@Roles()`) and reflected in the UI.
- All DTOs are validated (class-validator); the API throws **typed exceptions with codes**, never raw `Error`.
- JWT **access + refresh** with refresh-token rotation.

### Contractor data isolation (multi-tenant)
- **Defense in depth:** Postgres **Row-Level Security** + app-layer `client_id` scoping.
- The API connects as a **non-owner, non-`BYPASSRLS`** role and runs `SET LOCAL app.current_client_id =
  '<jwt.client_id>'` inside a **per-request transaction**, so RLS is active for every DB call. Policy:
  `USING (client_id = current_setting('app.current_client_id')::uuid)`.
- **`client_id` must be the leading column** of every composite index/unique constraint on client-scoped
  tables (RLS is ~100× slower otherwise).
- **Invariant test:** a Contractor token for one client requesting another client's well returns
  **zero rows** (and `403`/`404` at the API). This test must never regress — see
  [`docs/phases.md` Phase 2 gate](./phases.md#phase-2--auth--rbac-) and cross-cutting verification.

### Auditability
- An **audit trail** records **who changed what, when** (`AuditLog`, client-scoped): captures, plan/approval
  transitions, and export downloads are all audited.
- Plans carry **approval** state and versioning for governance.

### Deployability (on-prem + cloud)
- **12-factor** configuration via environment variables (`.env.example` provided); **no hard cloud
  dependency**. The full stack runs via `docker-compose` (`web`, `api`, `db`, `ml`) on-prem or in any cloud.

### Data conventions
- **Depths / lengths are stored in METERS internally** and converted to **feet** (or other display units)
  **at the UI only**. All engineering computation is done in meters; results persist back in meters.
  Authoritative: [`docs/domain-formulas.md` §13 Unit Conventions](./domain-formulas.md).
- **All timestamps are stored and transmitted in UTC** (ISO-8601); local time is a display concern.
- **Money** is stored in a single **configured currency (USD by default)**; cost-bearing records carry an
  explicit `currency` field, and currencies are not mixed in an aggregate without conversion.
- **UUID primary keys** only.
- The **8 IADC dull-grade positions** are captured as discrete fields, each with init and final values.

### Quality & correctness
- Analytics functions are **pure and unit-tested** against the worked examples in
  [`docs/domain-formulas.md`](./domain-formulas.md); the **cost-per-foot = `$48.8/ft`** fixture is a
  standing invariant.
- Every phase must end **verifiable** (migrations apply, seed loads, tests pass, Swagger generates, RLS
  zero-rows test passes) — see [`docs/phases.md`](./phases.md).

---

*DrillIQ — drill smarter: plan, capture, analyze, report.*
