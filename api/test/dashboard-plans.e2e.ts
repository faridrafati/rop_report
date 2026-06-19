/**
 * Phase 5 gate — Management dashboard KPIs + Office-Engineer plan/approval
 * state machine, against the live API (RLS role).
 *   - /dashboard/kpis returns roll-ups.
 *   - Office creates plan + recommendation; Management approves.
 *   - RBAC: Office cannot approve; Management cannot author.
 *   - State machine guards invalid transitions (400).
 *
 * Usage: BASE=http://localhost:3000/api tsx test/dashboard-plans.e2e.ts
 */
const BASE = process.env.BASE ?? 'http://localhost:3000/api';
const PASSWORD = 'demo-password';

let failures = 0;
function check(label: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ FAIL: ${label} ${extra}`); failures++; }
}

async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
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
  console.log('Phase 5 e2e — dashboard KPIs + plan/approval:');
  const office = (await login('office@demo.drilliq')).accessToken;
  const mgmt = (await login('management@demo.drilliq')).accessToken;

  // 1. Dashboard KPIs.
  const kpiRes = await authed(mgmt, 'GET', '/dashboard/kpis');
  const kpis = (await kpiRes.json()) as { bitRunCount: number; bitLeaderboard: unknown[]; footageByWell: unknown[] };
  check('dashboard KPIs → 200', kpiRes.status === 200, `got ${kpiRes.status}`);
  check('KPIs include bit run count + leaderboard', typeof kpis.bitRunCount === 'number' && Array.isArray(kpis.bitLeaderboard));

  // 2. A well to plan against.
  const opts = (await (await authed(office, 'GET', '/rop-optimization/options')).json()) as { wells: { id: string }[] };
  check('have at least one well', opts.wells.length > 0);
  const wellId = opts.wells[0]!.id;

  // 3. RBAC: Management cannot author a plan.
  const mgmtCreate = await authed(mgmt, 'POST', '/plans', { wellId, title: 'x', kind: 'BIT_PROGRAM' });
  check('management cannot create plan → 403', mgmtCreate.status === 403, `got ${mgmtCreate.status}`);

  // 4. Office creates a plan (DRAFT).
  const createRes = await authed(office, 'POST', '/plans', { wellId, title: '8½" bit program', kind: 'BIT_PROGRAM' });
  check('office creates plan → 201', createRes.status === 201, `got ${createRes.status}`);
  const plan = (await createRes.json()) as { id: string; status: string };
  check('new plan is DRAFT', plan.status === 'DRAFT', `got ${plan.status}`);

  // 5. Add a recommendation.
  const recRes = await authed(office, 'POST', `/plans/${plan.id}/recommendations`, {
    targetWob: 35000, targetRpm: 120, targetFlow: 750, rationale: 'offset benchmark',
  });
  check('office adds recommendation → 201', recRes.status === 201, `got ${recRes.status}`);

  // 6. Office cannot approve.
  const officeApprove = await authed(office, 'POST', `/plans/${plan.id}/approve`, {});
  check('office cannot approve → 403', officeApprove.status === 403, `got ${officeApprove.status}`);

  // 7. Cannot approve a DRAFT (must be PROPOSED).
  const earlyApprove = await authed(mgmt, 'POST', `/plans/${plan.id}/approve`, {});
  check('approving a DRAFT → 400 (state machine)', earlyApprove.status === 400, `got ${earlyApprove.status}`);

  // 8. Office submits → PROPOSED.
  const submit = await authed(office, 'POST', `/plans/${plan.id}/submit`);
  const submitted = (await submit.json()) as { status: string };
  check('submit → PROPOSED', submit.status === 201 || submit.status === 200 ? submitted.status === 'PROPOSED' : false, `got ${submit.status}/${submitted.status}`);

  // 9. Management approves → APPROVED.
  const approve = await authed(mgmt, 'POST', `/plans/${plan.id}/approve`, { comment: 'looks good' });
  const approved = (await approve.json()) as { status: string };
  check('management approves → APPROVED', approved.status === 'APPROVED', `got ${approve.status}/${approved.status}`);

  // 10. Approval history recorded.
  const detail = (await (await authed(mgmt, 'GET', `/plans/${plan.id}`)).json()) as { approvals: { status: string }[]; recommendations: unknown[] };
  check('approval history + recommendation persisted', detail.approvals.some((a) => a.status === 'APPROVED') && detail.recommendations.length === 1);

  console.log(
    failures === 0
      ? '\nPHASE 5 GATE PASSED ✓ — dashboards + plan/approval workflow enforced.'
      : `\nPHASE 5 GATE FAILED ✗ — ${failures} assertion(s) failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
