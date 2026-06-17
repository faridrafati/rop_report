/**
 * Phase 1 gate: RLS tenant-isolation proof at the DATABASE layer.
 *
 * Connects as the restricted app role (drilliq_app — non-owner, NO BYPASSRLS),
 * sets app.current_client_id via SET LOCAL inside a transaction (exactly as the
 * API will per request), and asserts:
 *   1. Scoped to A, only A's wells are visible; B's well returns ZERO rows.
 *   2. Scoped to B, symmetric.
 *   3. With NO tenant set, the fail-closed accessor yields ZERO rows (not all).
 *   4. WITH CHECK blocks inserting a row for another tenant.
 *
 * Run: APP_DATABASE_URL=postgresql://drilliq_app:...@localhost:5432/drilliq pnpm tsx prisma/rls.test.ts
 * Exits non-zero on any failed assertion (CI gate).
 */
import { PrismaClient } from "@prisma/client";

const APP_URL =
  process.env.APP_DATABASE_URL ??
  "postgresql://drilliq_app:change-me-app@localhost:5432/drilliq?schema=public";

const CLIENT_A = "00000000-0000-0000-0000-0000000000aa";
const CLIENT_B = "00000000-0000-0000-0000-0000000000bb";

const prisma = new PrismaClient({ datasources: { db: { url: APP_URL } } });

let failures = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failures++;
  }
}

/** Run a callback inside a tx with the tenant GUC set (the per-request pattern). */
async function asTenant<T>(clientId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // clientId is a validated UUID constant here; the API binds the JWT's client_id.
    await tx.$executeRawUnsafe(`SET LOCAL app.current_client_id = '${clientId}'`);
    return fn(tx);
  });
}

async function rawWellIds(tx: any): Promise<string[]> {
  const rows = (await tx.$queryRawUnsafe(`SELECT id FROM well`)) as { id: string }[];
  return rows.map((r) => r.id);
}

async function main() {
  console.log("RLS isolation test (connected as restricted app role):");

  // Sanity: the role we're testing as must NOT bypass RLS.
  const roleRows = (await prisma.$queryRawUnsafe(
    `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
  )) as { current_user: string; bypass: boolean }[];
  check(
    `connected as non-BYPASSRLS role (current_user=${roleRows[0]?.current_user})`,
    roleRows[0]?.bypass === false,
  );

  // 1. Scoped to A: see A's wells, never B's.
  await asTenant(CLIENT_A, async (tx) => {
    const ids = await rawWellIds(tx);
    const namesA = (await tx.$queryRawUnsafe(
      `SELECT name, client_id FROM well`,
    )) as { name: string; client_id: string }[];
    check("tenant A sees >= 1 well", ids.length >= 1);
    check(
      "tenant A sees ONLY client A rows",
      namesA.every((r: { client_id: string }) => r.client_id === CLIENT_A),
    );
    const bWell = (await tx.$queryRawUnsafe(
      `SELECT id FROM well WHERE client_id = '${CLIENT_B}'`,
    )) as { id: string }[];
    check("tenant A sees ZERO of client B's wells", bWell.length === 0);
  });

  // 2. Symmetric for B.
  await asTenant(CLIENT_B, async (tx) => {
    const rows = (await tx.$queryRawUnsafe(`SELECT client_id FROM well`)) as { client_id: string }[];
    check("tenant B sees ONLY client B rows", rows.every((r: { client_id: string }) => r.client_id === CLIENT_B));
    check("tenant B sees >= 1 well", rows.length >= 1);
  });

  // 3. Fail-closed: no tenant set => zero rows (NOT all rows).
  await prisma.$transaction(async (tx) => {
    const rows = (await tx.$queryRawUnsafe(`SELECT id FROM well`)) as { id: string }[];
    check("no tenant set => ZERO wells (fail-closed)", rows.length === 0);
  });

  // 4. WITH CHECK blocks cross-tenant insert: as A, inserting a B-owned well must fail.
  let blocked = false;
  try {
    await asTenant(CLIENT_A, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO well (id, client_id, name, status, created_at, updated_at)
         VALUES (gen_random_uuid(), '${CLIENT_B}', 'SNEAKY', 'PLANNED', now(), now())`,
      );
    });
  } catch {
    blocked = true;
  }
  check("WITH CHECK blocks inserting a row for another tenant", blocked);

  console.log(
    failures === 0
      ? "\nRLS GATE PASSED ✓ — database enforces tenant isolation."
      : `\nRLS GATE FAILED ✗ — ${failures} assertion(s) failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
