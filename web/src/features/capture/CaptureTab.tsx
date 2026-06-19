import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateBitRunSchema,
  CreateDailyReportSchema,
  DULL_CHAR_CODES,
  isNpt,
  type CreateActivityInput,
  type CreateFluidInput,
} from '@drilliq/shared';
import {
  createBitRun,
  createDailyReport,
  fetchBitRuns,
  fetchDailyReports,
  fetchRefs,
  type CaptureRefs,
} from './api';
import { useAuth } from '../../auth/AuthContext';

const num = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const inputCls =
  'rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const labelCls = 'flex flex-col gap-1 text-xs font-medium text-gray-600';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={labelCls}>
      {label}
      {children}
    </label>
  );
}

// ─────────────────────────── Dull grade (8 positions) ───────────────────────
interface DullState {
  inner: string; outer: string; dullChar: string; location: string;
  bearing: string; gauge: string; other: string; reason: string;
}
const emptyDull: DullState = { inner: '', outer: '', dullChar: '', location: '', bearing: '', gauge: '', other: '', reason: '' };

function dullToInput(d: DullState) {
  const e = (v: string) => (v.trim() === '' ? null : v);
  return {
    inner: num(d.inner) ?? null,
    outer: num(d.outer) ?? null,
    dullChar: e(d.dullChar),
    location: e(d.location),
    bearing: e(d.bearing),
    gauge: e(d.gauge),
    other: e(d.other),
    reason: e(d.reason),
  };
}

function DullGradeFields({ value, onChange, reasons }: {
  value: DullState; onChange: (d: DullState) => void; reasons: CaptureRefs['reasonsPulled'];
}) {
  const set = (k: keyof DullState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Field label="1 Inner (0–8)"><input className={inputCls} type="number" min={0} max={8} value={value.inner} onChange={set('inner')} /></Field>
      <Field label="2 Outer (0–8)"><input className={inputCls} type="number" min={0} max={8} value={value.outer} onChange={set('outer')} /></Field>
      <Field label="3 Dull char">
        <select className={inputCls} value={value.dullChar} onChange={set('dullChar')}>
          <option value="">—</option>
          {DULL_CHAR_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="4 Location"><input className={inputCls} value={value.location} onChange={set('location')} placeholder="N/M/G/A" /></Field>
      <Field label="5 Bearing"><input className={inputCls} value={value.bearing} onChange={set('bearing')} placeholder="0–8 / E / X" /></Field>
      <Field label="6 Gauge"><input className={inputCls} value={value.gauge} onChange={set('gauge')} placeholder="I / 1/16" /></Field>
      <Field label="7 Other">
        <select className={inputCls} value={value.other} onChange={set('other')}>
          <option value="">—</option>
          {DULL_CHAR_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="8 Reason pulled">
        <select className={inputCls} value={value.reason} onChange={set('reason')}>
          <option value="">—</option>
          {reasons.map((r) => <option key={r.id} value={r.code}>{r.code}</option>)}
        </select>
      </Field>
    </div>
  );
}

// ─────────────────────────────── Bit-run form ───────────────────────────────
function BitRunForm({ refs }: { refs: CaptureRefs }) {
  const qc = useQueryClient();
  const [wellboreId, setWellboreId] = useState('');
  const [bitMasterId, setBitMasterId] = useState('');
  const [reasonPulledId, setReasonPulledId] = useState('');
  const [p, setP] = useState({ numBit: '', depthIn: '', depthOut: '', footage: '', rotatingHours: '', tripHours: '', wob: '', rpm: '', torque: '', rop: '', flowRate: '', mudWeight: '' });
  const [bitClass, setBitClass] = useState('');
  const [showInit, setShowInit] = useState(false);
  const [condFinal, setCondFinal] = useState<DullState>(emptyDull);
  const [condInit, setCondInit] = useState<DullState>(emptyDull);
  const [dys, setDys] = useState({ stickSlip: false, whirl: false, bitBounce: false, bitBalling: false });
  const [error, setError] = useState<string | null>(null);

  const setParam = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value });

  const mut = useMutation({
    mutationFn: createBitRun,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bit-runs'] });
      setP({ numBit: '', depthIn: '', depthOut: '', footage: '', rotatingHours: '', tripHours: '', wob: '', rpm: '', torque: '', rop: '', flowRate: '', mudWeight: '' });
      setCondFinal(emptyDull); setCondInit(emptyDull); setDys({ stickSlip: false, whirl: false, bitBounce: false, bitBalling: false });
      setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      wellboreId, bitMasterId,
      reasonPulledId: reasonPulledId || undefined,
      numBit: num(p.numBit), depthIn: num(p.depthIn), depthOut: num(p.depthOut), footage: num(p.footage),
      rotatingHours: num(p.rotatingHours), tripHours: num(p.tripHours),
      wob: num(p.wob), rpm: num(p.rpm), torque: num(p.torque), rop: num(p.rop), flowRate: num(p.flowRate), mudWeight: num(p.mudWeight),
      bitClass: bitClass || undefined,
      condFinal: dullToInput(condFinal),
      condInit: showInit ? dullToInput(condInit) : undefined,
      dysfunction: dys,
    };
    const parsed = CreateBitRunSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }
    mut.mutate(parsed.data);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Capture a bit run</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Wellbore *">
          <select className={inputCls} required value={wellboreId} onChange={(e) => setWellboreId(e.target.value)}>
            <option value="">Select…</option>
            {refs.wellbores.map((w) => <option key={w.id} value={w.id}>{w.well?.name ? `${w.well.name} / ${w.name}` : w.name}</option>)}
          </select>
        </Field>
        <Field label="Bit (BitMaster) *">
          <select className={inputCls} required value={bitMasterId} onChange={(e) => setBitMasterId(e.target.value)}>
            <option value="">Select…</option>
            {refs.bitMasters.map((b) => <option key={b.id} value={b.id}>{[b.manufacturer, b.typeBit, b.codeIadc].filter(Boolean).join(' · ')}</option>)}
          </select>
        </Field>
        <Field label="Reason pulled">
          <select className={inputCls} value={reasonPulledId} onChange={(e) => setReasonPulledId(e.target.value)}>
            <option value="">—</option>
            {refs.reasonsPulled.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.description}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        <Field label="Bit #"><input className={inputCls} type="number" value={p.numBit} onChange={setParam('numBit')} /></Field>
        <Field label="Depth in (m)"><input className={inputCls} type="number" value={p.depthIn} onChange={setParam('depthIn')} /></Field>
        <Field label="Depth out (m)"><input className={inputCls} type="number" value={p.depthOut} onChange={setParam('depthOut')} /></Field>
        <Field label="Footage (m)"><input className={inputCls} type="number" value={p.footage} onChange={setParam('footage')} /></Field>
        <Field label="Rotating hr"><input className={inputCls} type="number" value={p.rotatingHours} onChange={setParam('rotatingHours')} /></Field>
        <Field label="Trip hr"><input className={inputCls} type="number" value={p.tripHours} onChange={setParam('tripHours')} /></Field>
        <Field label="WOB (lbf)"><input className={inputCls} type="number" value={p.wob} onChange={setParam('wob')} /></Field>
        <Field label="RPM"><input className={inputCls} type="number" value={p.rpm} onChange={setParam('rpm')} /></Field>
        <Field label="Torque (ft-lbf)"><input className={inputCls} type="number" value={p.torque} onChange={setParam('torque')} /></Field>
        <Field label="ROP (ft/hr)"><input className={inputCls} type="number" value={p.rop} onChange={setParam('rop')} /></Field>
        <Field label="Flow Q (gpm)"><input className={inputCls} type="number" value={p.flowRate} onChange={setParam('flowRate')} /></Field>
        <Field label="MW (ppg)"><input className={inputCls} type="number" value={p.mudWeight} onChange={setParam('mudWeight')} /></Field>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Field label="Bit class">
          <select className={inputCls} value={bitClass} onChange={(e) => setBitClass(e.target.value)}>
            <option value="">—</option><option value="N">N (new)</option><option value="U">U (used)</option>
          </select>
        </Field>
        <div className="flex flex-wrap items-center gap-3 pt-4 text-sm">
          {(['stickSlip', 'whirl', 'bitBounce', 'bitBalling'] as const).map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={dys[k]} onChange={(e) => setDys({ ...dys, [k]: e.target.checked })} />
              {k === 'stickSlip' ? 'Stick-slip' : k === 'bitBounce' ? 'Bit bounce' : k === 'bitBalling' ? 'Bit balling' : 'Whirl'}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-700">IADC dull grade — final (graded out)</p>
        <DullGradeFields value={condFinal} onChange={setCondFinal} reasons={refs.reasonsPulled} />
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={showInit} onChange={(e) => setShowInit(e.target.checked)} /> capture initial (as-received) dull grade
      </label>
      {showInit && (
        <div>
          <p className="mb-1 text-xs font-semibold text-gray-700">IADC dull grade — initial</p>
          <DullGradeFields value={condInit} onChange={setCondInit} reasons={refs.reasonsPulled} />
        </div>
      )}
      {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div>
        <button type="submit" disabled={mut.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {mut.isPending ? 'Saving…' : 'Save bit run'}
        </button>
      </div>
    </form>
  );
}

function BitRunList() {
  const { data, isLoading } = useQuery({ queryKey: ['bit-runs'], queryFn: fetchBitRuns });
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  const runs = data ?? [];
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>{['Bit', 'Bit #', 'Depth in', 'Depth out', 'Footage', 'Dull (final)', 'Reason', 'Dysfunctions'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((r) => {
            const dys = [r.stickSlip && 'stick-slip', r.whirl && 'whirl', r.bitBounce && 'bounce', r.bitBalling && 'balling'].filter(Boolean).join(', ');
            const dull = [r.condFinalInner, r.condFinalOuter, r.condFinalDullChar].filter((x) => x != null).join('-');
            return (
              <tr key={r.id}>
                <td className="px-3 py-2">{[r.bitMaster?.manufacturer, r.bitMaster?.typeBit].filter(Boolean).join(' ')}</td>
                <td className="px-3 py-2">{r.numBit ?? '—'}</td>
                <td className="px-3 py-2">{r.depthIn ?? '—'}</td>
                <td className="px-3 py-2">{r.depthOut ?? '—'}</td>
                <td className="px-3 py-2">{r.footage ?? '—'}</td>
                <td className="px-3 py-2">{dull || '—'}</td>
                <td className="px-3 py-2">{r.condFinalReason ?? '—'}</td>
                <td className="px-3 py-2 text-amber-700">{dys || '—'}</td>
              </tr>
            );
          })}
          {runs.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-400">No bit runs yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────── DDR form ──────────────────────────────────
function DdrForm({ refs }: { refs: CaptureRefs }) {
  const qc = useQueryClient();
  const [wellboreId, setWellboreId] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [statusInfo, setStatusInfo] = useState('');
  const [activities, setActivities] = useState<CreateActivityInput[]>([
    { classification: 'PLANNED', isProductive: true, durationHr: undefined, description: '' },
  ]);
  const [fluids, setFluids] = useState<CreateFluidInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: createDailyReport,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['daily-reports'] });
      setStatusInfo(''); setActivities([{ classification: 'PLANNED', isProductive: true, description: '' }]); setFluids([]); setError(null);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save'),
  });

  const nptHrs = useMemo(
    () => activities.filter((a) => isNpt({ classification: a.classification, isProductive: a.isProductive })).reduce((s, a) => s + (a.durationHr ?? 0), 0),
    [activities],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      wellboreId, reportDate, statusInfo: statusInfo || undefined,
      activities, fluids,
    };
    const parsed = CreateDailyReportSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }
    mut.mutate(parsed.data);
  }

  const setAct = (i: number, patch: Partial<CreateActivityInput>) =>
    setActivities(activities.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Capture a daily drilling report</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Wellbore *">
          <select className={inputCls} required value={wellboreId} onChange={(e) => setWellboreId(e.target.value)}>
            <option value="">Select…</option>
            {refs.wellbores.map((w) => <option key={w.id} value={w.id}>{w.well?.name ? `${w.well.name} / ${w.name}` : w.name}</option>)}
          </select>
        </Field>
        <Field label="Report date *"><input className={inputCls} type="date" required value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></Field>
        <Field label="NPT (hr, derived)"><input className={inputCls} value={nptHrs} readOnly /></Field>
      </div>
      <Field label="Status / 24-hr summary"><textarea className={inputCls} rows={2} value={statusInfo} onChange={(e) => setStatusInfo(e.target.value)} /></Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700">Activities (productive vs NPT)</p>
          <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setActivities([...activities, { classification: 'PLANNED', isProductive: true, description: '' }])}>+ add activity</button>
        </div>
        {activities.map((a, i) => (
          <div key={i} className="flex flex-col gap-2 sm:grid sm:grid-cols-12 sm:items-end">
            <div className="col-span-3"><Field label="Classification">
              <select className={inputCls} value={a.classification} onChange={(e) => setAct(i, { classification: e.target.value as CreateActivityInput['classification'] })}>
                <option value="PLANNED">PLANNED</option><option value="UNPLANNED">UNPLANNED</option><option value="DOWNTIME">DOWNTIME</option>
              </select></Field></div>
            <div className="col-span-2"><Field label="Productive">
              <select className={inputCls} value={a.isProductive ? 'y' : 'n'} onChange={(e) => setAct(i, { isProductive: e.target.value === 'y' })}>
                <option value="y">Yes</option><option value="n">No (NPT)</option>
              </select></Field></div>
            <div className="col-span-2"><Field label="Duration hr"><input className={inputCls} type="number" value={a.durationHr ?? ''} onChange={(e) => setAct(i, { durationHr: num(e.target.value) })} /></Field></div>
            <div className="col-span-4"><Field label="Description"><input className={inputCls} value={a.description ?? ''} onChange={(e) => setAct(i, { description: e.target.value })} /></Field></div>
            <div className="col-span-1"><button type="button" className="text-xs text-red-500" onClick={() => setActivities(activities.filter((_, j) => j !== i))}>✕</button></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700">Fluid checks</p>
          <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setFluids([...fluids, {}])}>+ add fluid</button>
        </div>
        {fluids.map((f, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-6">
            <Field label="MW (ppg)"><input className={inputCls} type="number" value={f.mw ?? ''} onChange={(e) => setFluids(fluids.map((x, j) => j === i ? { ...x, mw: num(e.target.value) } : x))} /></Field>
            <Field label="PV"><input className={inputCls} type="number" value={f.pv ?? ''} onChange={(e) => setFluids(fluids.map((x, j) => j === i ? { ...x, pv: num(e.target.value) } : x))} /></Field>
            <Field label="YP"><input className={inputCls} type="number" value={f.yp ?? ''} onChange={(e) => setFluids(fluids.map((x, j) => j === i ? { ...x, yp: num(e.target.value) } : x))} /></Field>
            <Field label="pH"><input className={inputCls} type="number" value={f.ph ?? ''} onChange={(e) => setFluids(fluids.map((x, j) => j === i ? { ...x, ph: num(e.target.value) } : x))} /></Field>
            <Field label="ECD"><input className={inputCls} type="number" value={f.ecd ?? ''} onChange={(e) => setFluids(fluids.map((x, j) => j === i ? { ...x, ecd: num(e.target.value) } : x))} /></Field>
            <div><button type="button" className="text-xs text-red-500" onClick={() => setFluids(fluids.filter((_, j) => j !== i))}>✕ remove</button></div>
          </div>
        ))}
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div>
        <button type="submit" disabled={mut.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {mut.isPending ? 'Saving…' : 'Save daily report'}
        </button>
      </div>
    </form>
  );
}

function DdrList() {
  const { data, isLoading } = useQuery({ queryKey: ['daily-reports'], queryFn: fetchDailyReports });
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  const rows = data ?? [];
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>{['Date', 'Report #', 'Status', 'Activities', 'Fluids'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{r.reportDate?.slice(0, 10)}</td>
              <td className="px-3 py-2">{r.reportNo ?? '—'}</td>
              <td className="px-3 py-2 max-w-md truncate">{r.statusInfo ?? '—'}</td>
              <td className="px-3 py-2">{r._count?.activities ?? 0}</td>
              <td className="px-3 py-2">{r._count?.fluids ?? 0}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No daily reports yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────── Tab shell ─────────────────────────────────
export function CaptureTab() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'bit' | 'ddr'>('bit');
  const refsQuery = useQuery({ queryKey: ['capture-refs'], queryFn: fetchRefs });
  const canWrite = user?.role === 'OPERATION_ENGINEER';

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Capture</h1>
      {!canWrite && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Capture is the Operation Engineer's workflow — you can view records but writes are role-gated (403).
        </p>
      )}
      <div className="flex gap-2 border-b border-gray-200">
        {(['bit', 'ddr'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500'}`}>
            {t === 'bit' ? 'Bit runs' : 'Daily reports'}
          </button>
        ))}
      </div>
      {refsQuery.isLoading && <p className="text-sm text-gray-500">Loading reference data…</p>}
      {refsQuery.data && tab === 'bit' && (
        <>
          {canWrite && <BitRunForm refs={refsQuery.data} />}
          <BitRunList />
        </>
      )}
      {refsQuery.data && tab === 'ddr' && (
        <>
          {canWrite && <DdrForm refs={refsQuery.data} />}
          <DdrList />
        </>
      )}
    </main>
  );
}
