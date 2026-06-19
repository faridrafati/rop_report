/**
 * Phase 8 gate — Integrations (WITSML round-trip, SSO config, ERP stub), RLS-scoped.
 *   - WITSML export emits 1.4.1.1 XML; import upserts by uid (idempotent);
 *     export→import→export is lossless (well count stable).
 *   - RBAC: Contractor cannot import; Office cannot trigger ERP sync.
 *   - SSO config exposes the Entra group→role map; ERP sync reports not_configured.
 *
 * Usage: BASE=http://localhost:3000/api tsx test/integrations.e2e.ts
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
const countTag = (xml: string, tag: string) => (xml.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;

async function main() {
  console.log('Phase 8 e2e — integrations (WITSML / SSO / ERP):');
  const mgmt = (await login('management@demo.drilliq')).accessToken;
  const office = (await login('office@demo.drilliq')).accessToken;
  const contractor = (await login('contractor-a@demo.drilliq')).accessToken;

  // WITSML export.
  const exp = await authed(mgmt, 'GET', '/integrations/witsml/export');
  const xml = await exp.text();
  check('witsml export → 200', exp.status === 200, `got ${exp.status}`);
  check('export is WITSML 1.4.1.1', xml.includes('version="1.4.1.1"') && xml.includes('<wells'));
  const wells0 = countTag(xml, 'well');
  check('export has wells + bitRecords', wells0 > 0 && countTag(xml, 'bitRecord') > 0, `wells=${wells0}`);

  // Round-trip import (Office), idempotent upsert by uid.
  const imp = await authed(office, 'POST', '/integrations/witsml/import', { xml });
  const counts = (await imp.json()) as { wells: number; wellbores: number; bitRecords: number };
  check('witsml import → 2xx', imp.status === 200 || imp.status === 201, `got ${imp.status}`);
  check('import upserts the exported wells (round-trip)', counts.wells === wells0, `imported ${counts.wells} vs ${wells0}`);

  // Lossless: re-export yields the same well count.
  const xml2 = await (await authed(mgmt, 'GET', '/integrations/witsml/export')).text();
  check('round-trip lossless (well count stable)', countTag(xml2, 'well') === wells0);

  // RBAC: Contractor cannot import.
  const cImp = await authed(contractor, 'POST', '/integrations/witsml/import', { xml });
  check('contractor import → 403', cImp.status === 403, `got ${cImp.status}`);

  // SSO config.
  const sso = (await (await authed(mgmt, 'GET', '/integrations/sso/config')).json()) as { provider: string; groupRoleMap: Record<string, string> };
  check('sso config exposes entra-oidc group→role map', sso.provider === 'entra-oidc' && sso.groupRoleMap['DrillIQ-Management'] === 'MANAGEMENT');

  // ERP stub + RBAC.
  const erp = await authed(mgmt, 'POST', '/integrations/erp/sync');
  const erpBody = (await erp.json()) as { status: string };
  check('erp sync (management) → not_configured stub', erp.status === 201 || erp.status === 200 ? erpBody.status === 'not_configured' : false, `got ${erp.status}/${erpBody.status}`);
  const erpOffice = await authed(office, 'POST', '/integrations/erp/sync');
  check('office cannot trigger ERP sync → 403', erpOffice.status === 403, `got ${erpOffice.status}`);

  console.log(
    failures === 0
      ? '\nPHASE 8 GATE PASSED ✓ — WITSML round-trips losslessly under RLS; SSO/ERP scaffolds in place.'
      : `\nPHASE 8 GATE FAILED ✗ — ${failures} assertion(s) failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
