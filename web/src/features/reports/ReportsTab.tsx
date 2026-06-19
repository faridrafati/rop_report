import { useState } from 'react';
import { authHeader, saveAuth } from '../../auth/auth';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeader() } });
  if (!res.ok) {
    if (res.status === 401) saveAuth(null);
    throw new Error(`${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const EXPORTS = [
  { path: '/api/reports/bit-runs.xlsx', filename: 'drilliq-bit-runs.xlsx', title: 'Bit runs — Excel', desc: 'Workbook of bit runs (ROP, MSE, HSI, cost/m) + cost-per-foot reference sheet.' },
  { path: '/api/reports/bit-runs.pdf', filename: 'drilliq-bit-runs.pdf', title: 'Bit runs — PDF', desc: 'Printable bit-run summary with top runs by ROP.' },
  { path: '/api/reports/daily-reports.xlsx', filename: 'drilliq-daily-reports.xlsx', title: 'Daily reports — Excel', desc: 'DDR activities with NPT classification.' },
];

export function ReportsTab() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, filename: string) {
    setBusy(path); setError(null);
    try { await download(path, filename); } catch (e) { setError(e instanceof Error ? e.message : 'Export failed'); }
    finally { setBusy(null); }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports &amp; exports</h1>
      <p className="mt-1 text-sm text-slate-500">Exports are scoped to your client (RLS-enforced) and every download is audited.</p>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {EXPORTS.map((e) => (
          <div key={e.path} className="card flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold text-slate-900">{e.title}</h2>
            <p className="flex-1 text-sm text-slate-500">{e.desc}</p>
            <button className="btn-primary self-start" disabled={busy === e.path} onClick={() => run(e.path, e.filename)}>
              {busy === e.path ? 'Generating…' : 'Download'}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
