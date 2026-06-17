# DrillIQ

**Drill-bit performance & daily-drilling-report (DDR) analytics platform.**

DrillIQ helps drilling engineers and management **plan** bit & parameter
selection, **capture** what happened at the rig, **analyze** bit performance
(ROP, MSE, HSI, cost-per-foot, founder point), and **report** — across wells,
fields and contractors, with strict per-tenant data isolation.

> Login-gated internal/B2B platform. Deployable **on-prem or cloud**.

---

## Quick start (fresh system)

You need only **Node.js ≥ 20** and **Docker** (with the Compose plugin).
Everything else — pnpm, PostgreSQL, the database roles, migrations and seed
data — is set up for you.

```bash
# Linux / macOS / WSL
./run.sh            # bootstrap everything, then start web + api

# Windows
run.bat
```

Then open:

| Surface | URL |
|---------|-----|
| Web app | http://localhost:5173 |
| API     | http://localhost:3000/api |
| Swagger | http://localhost:3000/api/docs |
| ROP Optimization tab | http://localhost:5173/rop |

### `run.sh` / `run.bat` subcommands

| Command | What it does |
|---------|--------------|
| _(none)_ / `all` | full bootstrap, then start web + api |
| `setup` | bootstrap only (install, DB, migrate, seed, RLS gate) — no start |
| `start` | start web + api (assumes setup done) |
| `test`  | run analytics unit tests **and** the RLS isolation gate |
| `reset` | drop + recreate the database (**destructive**), then re-setup |
| `stop`  | stop the Docker stack |

---

## Architecture

A pnpm-workspace monorepo. Deployable via `docker compose`.

```
rop_report/
├── web/              Vite + React + TS SPA (TanStack Query/Table, Recharts, Tailwind)
├── api/              NestJS REST + Swagger (JWT + RBAC, Prisma)
├── db/               Prisma schema + migrations (PostgreSQL + Row-Level Security) + seeds
├── ml/               Python FastAPI ROP-prediction service (DEFERRED — Phase 7 placeholder)
├── packages/shared/  @drilliq/shared — drilling analytics formulas + Zod contracts (pure, tested)
└── docs/             spec · domain-formulas · data-model · phases
```

| Layer | Stack |
|-------|-------|
| Front end | Vite + React + TypeScript, TanStack Query/Table, Recharts, React Hook Form + Zod, Tailwind |
| API | NestJS, `@nestjs/swagger`, JWT access+refresh, `RolesGuard` + `@Roles()` RBAC, Prisma |
| Database | PostgreSQL with **Row-Level Security**; UUID PKs; `client_id` leading every composite index |
| Analytics | `@drilliq/shared` — pure, unit-tested formula functions |
| ML | Python FastAPI (deferred) |

### Roles (RBAC)

| Role | Capability |
|------|-----------|
| **Management** | read-only dashboards, fleet KPIs, approvals/audit |
| **Office Engineer** | plans, bit programs, analytics (planning) |
| **Operation Engineer** | DDR + bit-run capture (incl. 8-position IADC dull grade) |
| **Contractor** | **read-only**, **own client's wells only** (RLS-enforced) |

**Demo logins** (seeded; password `demo-password`): `management@demo.drilliq`,
`office@demo.drilliq`, `operation@demo.drilliq`, `contractor-a@demo.drilliq`
(tenant A), `contractor-b@demo.drilliq` (tenant B). `POST /api/auth/login`
returns access + refresh tokens; send `Authorization: Bearer <access>`.

### Contractor isolation (defense-in-depth)

1. **PostgreSQL RLS** — every client-scoped table has `ENABLE`/`FORCE ROW LEVEL
   SECURITY` with a `tenant_isolation` policy keyed on `app.current_client_id`,
   set per request via `SET LOCAL` inside a transaction. The app connects as a
   **non-owner, non-`BYPASSRLS`** role. A **fail-closed** accessor returns zero
   rows when no tenant is set.
2. **App-layer scoping** in the API.

The database enforces the boundary independently of application code — proven by
`db/prisma/rls.test.ts` (run via `./run.sh test`):

```
✓ tenant A sees ZERO of client B's wells
✓ no tenant set => ZERO wells (fail-closed)
✓ WITH CHECK blocks inserting a row for another tenant
```

---

## Domain analytics (`@drilliq/shared`)

All equations follow `docs/domain-formulas.md` exactly — **do not invent
formulas**. Inputs in field/imperial units; depths stored in **meters** (SI) and
converted at the formula/UI boundary.

| Metric | Formula |
|--------|---------|
| Bit area | `A_B = (π/4)·D_B²` |
| MSE (Teale 1965) | `WOB/A_B + (120·π·N·T)/(A_B·ROP)` |
| Sliding friction (Pessier/Fear) | `μ = 36·T/(D_B·WOB)` |
| TFA | `(π/4)·Σ(d_n/32)²` |
| Bit ΔP | `(MW·Q²)/(12031·Cd²·TFA²)` |
| HSI | `1.27·HHP_b/D_B²`, `HHP_b = P_bit·Q/1714` |
| Cost per foot | `C = [B + R·(t+T)]/F`  — canonical fixture **$48.8/ft** |
| Founder point | ROP flattens vs WOB while MSE rises |

Run the analytics tests: `pnpm --filter @drilliq/shared test` (42 tests pinned
to the worked examples).

### ROP Optimization

A standalone ROP-optimization tab (`/rop`) turns captured bit runs into a
parameter-optimization workbench: **Summary** KPIs, a **WOB×RPM contour** drill-
off map with an optimal-window highlight, **MSE** power-law fit + founder/drill-
off curve, **Hydraulics** (HSI optimum band), **Economics** (cost-per-meter by
bit type), scatter/by-size/table views. All math comes from `@drilliq/shared`.

---

## Build status

| Phase | Status |
|-------|--------|
| 0 — Foundations & spec | ✅ done |
| 1 — Data model & migrations + RLS | ✅ done |
| 2 — Auth & RBAC (JWT + RolesGuard + per-request RLS) | ✅ done |
| 4 — Analytics engine (formulas + tests) | ✅ done |
| ROP Optimization tab (standalone) | ✅ done |
| 3 — Capture (DDR + bit run) | ⏳ planned |
| 5 — Plan & analyze + dashboards | ⏳ planned |
| 6 — Reporting & exports (PDF/Excel) | ⏳ planned |
| 7 — ML ROP prediction | ⏸ deferred |
| 8 — Integrations (Entra ID SSO, WITSML, ERP) | ⏳ planned |

See `docs/phases.md` for the full plan and each phase's verification gate.

---

## Development

```bash
pnpm install                 # install workspace deps (pnpm via corepack)
pnpm dev                     # web + api in parallel
pnpm test                    # all workspace tests
pnpm db:migrate              # apply migrations (dev)
pnpm db:seed                 # load reference + demo data
docker compose up -d         # full stack (web, api, db, ml)
```

Seed reference vocabulary (contractors, mud types, hole/nozzle sizes, bit
makes/IADC codes, formations, …) is in `db/seed-data/*.json`.

---

## License

Proprietary — © Magma Energy. All rights reserved.
