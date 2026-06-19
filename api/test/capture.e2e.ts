/**
 * Phase 3 gate — Capture (bit-run + DDR) against a LIVE API as the restricted
 * drilliq_app role. Asserts the docs/phases.md Phase 3 gate:
 *   - 8-position dull grade (init+final) round-trips POST → GET unchanged.
 *   - Invalid dull char / out-of-range inner → 400.
 *   - Contractor (read-only) write → 403; Operation Engineer write → 201.
 *   - NPT derivation: a DOWNTIME/productive=false activity is flagged NPT.
 *
 * Usage: BASE=http://localhost:3000/api tsx test/capture.e2e.ts
 */
import { isNpt } from '@drilliq/shared';

const BASE = process.env.BASE ?? 'http://localhost:3000/api';
const PASSWORD = 'demo-password';

let failures = 0;
function check(label: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ FAIL: ${label} ${extra}`);
    failures++;
  }
}

async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  return (await r.json()) as { accessToken: string };
}

function authed(token: string, method: string, path: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function main() {
  console.log('Phase 3 e2e — capture (bit-run + DDR):');
  const op = (await login('operation@demo.drilliq')).accessToken;
  const contractor = (await login('contractor-a@demo.drilliq')).accessToken;

  // refs → pick a wellbore + bit master in this tenant.
  const refs = (await (await authed(op, 'GET', '/capture/refs')).json()) as {
    wellbores: { id: string }[];
    bitMasters: { id: string }[];
    reasonsPulled: { id: string; code: string }[];
    activityTypes: { id: string }[];
  };
  check('refs returns wellbores + bit masters', refs.wellbores.length > 0 && refs.bitMasters.length > 0);
  const wellboreId = refs.wellbores[0]!.id;
  const bitMasterId = refs.bitMasters[0]!.id;
  const reasonPulledId = (refs.reasonsPulled.find((r) => r.code === 'TD') ?? refs.reasonsPulled[0])?.id;

  // 1. Round-trip a full dull grade (init + final) + dysfunction flags.
  const condFinal = { inner: 2, outer: 3, dullChar: 'WT', location: 'G', bearing: 'E', gauge: 'I', other: 'BT', reason: 'TD' };
  const condInit = { inner: 0, outer: 0, dullChar: 'NO', location: 'A', bearing: 'X', gauge: 'I', other: 'NO', reason: 'HR' };
  const createRes = await authed(op, 'POST', '/bit-runs', {
    wellboreId, bitMasterId, reasonPulledId,
    numBit: 9, depthIn: 100, depthOut: 250, footage: 150,
    wob: 35000, rpm: 120, torque: 6000, rop: 80, flowRate: 750, mudWeight: 10,
    bitClass: 'N', condInit, condFinal,
    dysfunction: { stickSlip: true, whirl: false, bitBounce: false, bitBalling: false },
  });
  check('operation engineer creates a bit run → 201', createRes.status === 201, `got ${createRes.status}`);
  const created = (await createRes.json()) as { id: string };
  const got = (await (await authed(op, 'GET', `/bit-runs/${created.id}`)).json()) as Record<string, unknown>;
  check('dull grade final round-trips', got.condFinalInner === 2 && got.condFinalDullChar === 'WT' && got.condFinalReason === 'TD');
  check('dull grade init round-trips', got.condInitDullChar === 'NO' && got.condInitBearing === 'X');
  check('dysfunction flag persists', got.stickSlip === true);

  // 2. Validation: invalid dull char + out-of-range inner → 400.
  const badChar = await authed(op, 'POST', '/bit-runs', {
    wellboreId, bitMasterId, condFinal: { ...condFinal, dullChar: 'ZZ' },
  });
  check('invalid dull char → 400', badChar.status === 400, `got ${badChar.status}`);
  const badInner = await authed(op, 'POST', '/bit-runs', {
    wellboreId, bitMasterId, condFinal: { ...condFinal, inner: 9 },
  });
  check('out-of-range inner (9) → 400', badInner.status === 400, `got ${badInner.status}`);

  // 3. Contractor (read-only) write → 403.
  const contractorWrite = await authed(contractor, 'POST', '/bit-runs', { wellboreId, bitMasterId });
  check('contractor write → 403', contractorWrite.status === 403, `got ${contractorWrite.status}`);

  // 4. DDR with a Downtime/productive=false activity ⇒ NPT.
  //    Unique reportDate per run — DailyReport is unique on (client, wellbore, date).
  const reportDate = new Date(2010, 0, 1 + Math.floor(Math.random() * 6000)).toISOString().slice(0, 10);
  const ddrRes = await authed(op, 'POST', '/daily-reports', {
    wellboreId,
    reportDate,
    statusInfo: 'Waiting on cement',
    activities: [
      { classification: 'PLANNED', isProductive: true, durationHr: 18, description: 'Drilling ahead', iadcOpCode: 'DR' },
      { classification: 'DOWNTIME', isProductive: false, durationHr: 6, description: 'Rig repair', nptCategory: 'repair' },
    ],
    fluids: [{ mw: 10.2, pv: 18, yp: 22, ph: 9.5 }],
  });
  check('operation engineer creates a DDR → 201', ddrRes.status === 201, `got ${ddrRes.status}`);
  const ddr = (await ddrRes.json().catch(() => ({}))) as {
    activities?: { classification: string; isProductive: boolean }[];
  };
  const nptCount = (ddr.activities ?? []).filter(isNpt).length;
  check('NPT derived for the Downtime activity', nptCount === 1, `got ${nptCount}`);

  console.log(
    failures === 0
      ? '\nPHASE 3 GATE PASSED ✓ — capture round-trips, validates, RBAC + NPT enforced.'
      : `\nPHASE 3 GATE FAILED ✗ — ${failures} assertion(s) failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
