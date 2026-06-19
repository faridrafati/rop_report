# Legacy NIDC SQLite → ddr-app ETL

`etl.py` loads the legacy NIDC drilling database (`sqlite_DB/new.sqlite`,
originally an Access `new.mdb`) into the **ddr-app** Supabase Postgres using a
report-centric model (`daily_reports` is the hub; every operational child
resolves `(WellCode, fDate)` to a `report_id`).

> This ETL targets the separate **ddr-app** Supabase project, **not** DrillIQ's
> own Postgres. DrillIQ's app DB is reproduced from the committed Prisma
> migrations + `db/seed-data/*.json` via `./run.sh setup` and needs no sqlite.

## Inputs (not in git)

`sqlite_DB/*.sqlite` is git-ignored (449 MB binary). Copy `new.sqlite` to the
machine manually (USB / cloud drive / `scp`) and drop it in `<repo>/sqlite_DB/`.
The script auto-resolves `<repo>/sqlite_DB/new.sqlite` on any OS; override the
location with `SQLITE_SRC=/path/to/new.sqlite`.

## Configuration (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `SQLITE_SRC` | `<repo>/sqlite_DB/new.sqlite` | source sqlite path |
| `PG_DSN` | `host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres` | target Postgres (Supabase local default port is **54322**) |
| `SAMPLE_N` | `0` | if >0, only the first N wells (dry-run sizing) |
| `DRY_ROLLBACK` | unset | `1` = run the full load in a transaction then **roll back** (validates without writing) |

## Run on Ubuntu (second PC)

```bash
# 0. clone the repo + copy new.sqlite into ./sqlite_DB/ (see above)

# 1. start the ddr-app Supabase locally (in the ddr-app project dir)
supabase start            # exposes Postgres on 127.0.0.1:54322

# 2. python env + deps (psycopg v3)
python3 -m venv .venv && . .venv/bin/activate
pip install -r migration/requirements.txt

# 3. validate first (no writes), then load for real
DRY_ROLLBACK=1 python migration/etl.py     # dry run — rolls back
python migration/etl.py                     # COMMITS the full load
```

A first sanity check on a few wells: `SAMPLE_N=5 DRY_ROLLBACK=1 python migration/etl.py`.

## Notes / gotchas

- **`MIG_USER`** in `etl.py` is a hardcoded ddr-app profile UUID
  (`faridrafati@gmail.com`). On a fresh ddr-app Supabase, make sure that profile
  row exists, or edit the constant to a profile id present in the target.
- Dates in the legacy DB are **Jalali**; `etl.py` converts them to Gregorian.
- The loader is transactional: any error rolls the whole load back, so re-runs
  start clean (it also `ensure_clean()`s the target tables first).
