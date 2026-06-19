import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreatePlanSchema } from '@drilliq/shared';
import {
  addRecommendation,
  approvePlan,
  createPlan,
  fetchPlan,
  fetchPlans,
  rejectPlan,
  submitPlan,
} from './api';
import { fetchRopOptions } from '../rop/api';
import { useAuth } from '../../auth/AuthContext';

const inputCls = 'rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const statusTone: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PROPOSED: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export function PlansTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans });
  const options = useQuery({ queryKey: ['rop-options'], queryFn: fetchRopOptions });
  const [selected, setSelected] = useState<string | null>(null);

  const isOffice = user?.role === 'OFFICE_ENGINEER';
  const isMgmt = user?.role === 'MANAGEMENT';

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Plans &amp; approvals</h1>

      {isOffice && options.data && (
        <CreatePlanForm wells={options.data.wells} onCreated={() => void qc.invalidateQueries({ queryKey: ['plans'] })} />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{['Title', 'Well', 'Kind', 'Status', 'Recs'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(plans.data ?? []).map((p) => (
                <tr key={p.id} className={`cursor-pointer hover:bg-gray-50 ${selected === p.id ? 'bg-blue-50' : ''}`} onClick={() => setSelected(p.id)}>
                  <td className="px-3 py-2 font-medium">{p.title}</td>
                  <td className="px-3 py-2">{p.well?.name ?? '—'}</td>
                  <td className="px-3 py-2">{p.kind}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[p.status] ?? ''}`}>{p.status}</span></td>
                  <td className="px-3 py-2">{p._count?.recommendations ?? 0}</td>
                </tr>
              ))}
              {(plans.data ?? []).length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No plans yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {selected && <PlanDetailPanel id={selected} isOffice={isOffice} isMgmt={isMgmt} />}
      </div>
    </main>
  );
}

function CreatePlanForm({ wells, onCreated }: { wells: { id: string; name: string }[]; onCreated: () => void }) {
  const [wellId, setWellId] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('BIT_PROGRAM');
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: createPlan,
    onSuccess: () => { setTitle(''); setWellId(''); setError(null); onCreated(); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed'),
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = CreatePlanSchema.safeParse({ wellId, title, kind });
    if (!parsed.success) { setError(parsed.error.issues.map((i) => i.message).join('; ')); return; }
    mut.mutate(parsed.data);
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-4">
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Well
        <select className={inputCls} required value={wellId} onChange={(e) => setWellId(e.target.value)}>
          <option value="">Select…</option>
          {wells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Title
        <input className={inputCls} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="8½&quot; bit program" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Kind
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="BIT_PROGRAM">Bit program</option>
          <option value="PARAMETER_OPT">Parameter opt</option>
          <option value="OFFSET_BENCHMARK">Offset benchmark</option>
        </select>
      </label>
      <button type="submit" disabled={mut.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">New plan</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

function PlanDetailPanel({ id, isOffice, isMgmt }: { id: string; isOffice: boolean; isMgmt: boolean }) {
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ['plan', id], queryFn: () => fetchPlan(id) });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['plan', id] }); void qc.invalidateQueries({ queryKey: ['plans'] }); };
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: invalidate });

  const [wob, setWob] = useState(''); const [rpm, setRpm] = useState(''); const [rationale, setRationale] = useState('');
  const addRec = useMutation({
    mutationFn: () => addRecommendation(id, {
      targetWob: wob ? Number(wob) : undefined, targetRpm: rpm ? Number(rpm) : undefined, rationale: rationale || undefined,
    }),
    onSuccess: () => { setWob(''); setRpm(''); setRationale(''); invalidate(); },
  });

  if (plan.isLoading || !plan.data) return <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading…</div>;
  const p = plan.data;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{p.title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[p.status] ?? ''}`}>{p.status}</span>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-700">Recommendations ({p.recommendations.length})</p>
        <ul className="mt-1 flex flex-col gap-1 text-xs text-gray-600">
          {p.recommendations.map((r) => (
            <li key={r.id}>WOB {r.targetWob ?? '—'} · RPM {r.targetRpm ?? '—'} · {r.bitMaster?.typeBit ?? 'bit n/a'} {r.rationale ? `— ${r.rationale}` : ''}</li>
          ))}
          {p.recommendations.length === 0 && <li className="text-gray-400">none</li>}
        </ul>
      </div>

      {isOffice && (p.status === 'DRAFT' || p.status === 'REJECTED') && (
        <div className="flex flex-col gap-2 border-t border-gray-100 pt-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-600">WOB<input className={inputCls} value={wob} onChange={(e) => setWob(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">RPM<input className={inputCls} value={rpm} onChange={(e) => setRpm(e.target.value)} /></label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600">Rationale<input className={inputCls} value={rationale} onChange={(e) => setRationale(e.target.value)} /></label>
            <button onClick={() => addRec.mutate()} className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50">+ rec</button>
          </div>
          <button onClick={() => act.mutate(() => submitPlan(id))} className="self-start rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">Submit for approval</button>
        </div>
      )}

      {isMgmt && p.status === 'PROPOSED' && (
        <div className="flex gap-2 border-t border-gray-100 pt-2">
          <button onClick={() => act.mutate(() => approvePlan(id, 'approved'))} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">Approve</button>
          <button onClick={() => act.mutate(() => rejectPlan(id, 'rejected'))} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Reject</button>
        </div>
      )}

      {p.approvals.length > 0 && (
        <div className="border-t border-gray-100 pt-2">
          <p className="text-xs font-semibold text-gray-700">Approval history</p>
          <ul className="mt-1 text-xs text-gray-600">
            {p.approvals.map((a) => <li key={a.id}>{a.status}{a.comment ? ` — ${a.comment}` : ''}{a.decidedAt ? ` (${a.decidedAt.slice(0, 10)})` : ''}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
