/**
 * Phase 6 gate — Reporting & exports, RLS-scoped.
 *   - Excel exports return a valid xlsx (zip 'PK' magic) + correct content-type.
 *   - PDF export returns a valid '%PDF' document.
 *   - Contractor scoping: Client B (no bit runs) gets a report saying "0 bit
 *     runs"; Client A's report shows a positive count — proving exports never
 *     cross the tenant boundary.
 *
 * Usage: BASE=http://localhost:3000/api tsx test/reports.e2e.ts
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
async function getBuf(token: string, path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return {
    status: r.status,
    ctype: r.headers.get('content-type') ?? '',
    rows: Number(r.headers.get('x-report-rows') ?? '-1'),
    buf: Buffer.from(await r.arrayBuffer()),
  };
}

async function main() {
  console.log('Phase 6 e2e — reporting & exports:');
  const op = (await login('operation@demo.drilliq')).accessToken;
  const contractorB = (await login('contractor-b@demo.drilliq')).accessToken;

  // Excel — bit runs.
  const xlsx = await getBuf(op, '/reports/bit-runs.xlsx');
  check('bit-runs.xlsx → 200', xlsx.status === 200, `got ${xlsx.status}`);
  check('xlsx content-type', xlsx.ctype.includes('spreadsheetml'));
  check('xlsx is a valid workbook (PK zip magic)', xlsx.buf.subarray(0, 2).toString() === 'PK');

  // Excel — daily reports.
  const ddr = await getBuf(op, '/reports/daily-reports.xlsx');
  check('daily-reports.xlsx → 200 + PK', ddr.status === 200 && ddr.buf.subarray(0, 2).toString() === 'PK', `got ${ddr.status}`);

  // PDF — bit runs (Client A has runs).
  const pdf = await getBuf(op, '/reports/bit-runs.pdf');
  check('bit-runs.pdf → 200', pdf.status === 200, `got ${pdf.status}`);
  check('pdf is a valid document (%PDF magic)', pdf.buf.subarray(0, 4).toString() === '%PDF');
  check('Client A report is NOT empty', pdf.rows > 0, `rows=${pdf.rows}`);

  // Contractor scoping — Client B has no bit runs ⇒ X-Report-Rows = 0.
  const pdfB = await getBuf(contractorB, '/reports/bit-runs.pdf');
  check('contractor B pdf → 200', pdfB.status === 200, `got ${pdfB.status}`);
  check('CONTRACTOR SCOPE: Client B export contains 0 rows', pdfB.rows === 0, `rows=${pdfB.rows}`);

  console.log(
    failures === 0
      ? '\nPHASE 6 GATE PASSED ✓ — PDF + Excel exports valid and contractor-scoped.'
      : `\nPHASE 6 GATE FAILED ✗ — ${failures} assertion(s) failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
