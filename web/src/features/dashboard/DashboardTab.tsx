import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchKpis } from './api';
import { fetchRopOptimization } from '../rop/api';
import { Plot } from '../../components/Plot';

const fmt = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export function DashboardTab() {
  const kpis = useQuery({ queryKey: ['dashboard-kpis'], queryFn: fetchKpis });
  const rop = useQuery({ queryKey: ['dashboard-rop'], queryFn: () => fetchRopOptimization({}) });

  const points = rop.data?.points ?? [];
  const cross = useMemo(() => {
    const wob: number[] = [], rpm: number[] = [], ropF: number[] = [], mse: number[] = [], depth: number[] = [];
    for (const p of points) {
      if (p.wob != null && p.ropFthr != null) { wob.push(p.wob); ropF.push(p.ropFthr); }
      if (p.rpm != null && p.ropFthr != null) rpm.push(p.rpm);
      if (p.mse != null && p.depthIn != null) { mse.push(p.mse); depth.push(p.depthIn); }
    }
    return { wob, rpm, ropF, mse, depth };
  }, [points]);

  const k = kpis.data;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Management dashboard</h1>

      {kpis.isLoading && <p className="text-sm text-gray-500">Loading KPIs…</p>}
      {k && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Bit runs" value={k.bitRunCount.toLocaleString()} />
          <Kpi label="Avg cost/m" value={k.costPerMeterAvg == null ? '—' : `$${fmt(k.costPerMeterAvg)}`} />
          <Kpi label="Avg ROP" value={fmt(k.ropFtHrAvg)} sub="ft/hr" />
          <Kpi label="Avg MSE" value={fmt(k.mseAvg, 0)} sub="psi" />
          <Kpi label="NPT" value={k.nptPercent == null ? '—' : `${fmt(k.nptPercent)}%`} sub={`${fmt(k.nptHours)} npt / ${fmt(k.productiveHours)} prod hr`} />
          <Kpi label="Founder rate" value={k.founderRate == null ? '—' : `${fmt(k.founderRate * 100, 0)}%`} sub="of wells" />
        </section>
      )}

      {k && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Bit leaderboard — avg cost/m by make</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={k.bitLeaderboard.filter((b) => b.avgCostPerMeter != null).slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="make" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="avgCostPerMeter" fill="#2563eb">
                  {k.bitLeaderboard.map((_, i) => <Cell key={i} fill="#2563eb" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Footage by well (m)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={k.footageByWell.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="well" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="footageM" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Engineering cross-plots (Plotly)</h3>
        {rop.isLoading && <p className="text-sm text-gray-500">Loading points…</p>}
        {!rop.isLoading && points.length === 0 && <p className="text-sm text-gray-400">No qualifying bit-run points.</p>}
        {points.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Plot
              data={[{ x: cross.wob, y: cross.ropF, mode: 'markers', type: 'scattergl', marker: { size: 6, color: '#2563eb', opacity: 0.6 } }]}
              layout={{ title: 'WOB vs ROP', xaxis: { title: 'WOB (lbf)' }, yaxis: { title: 'ROP (ft/hr)' }, margin: { t: 30, l: 50, r: 10, b: 40 }, height: 260, autosize: true }}
              style={{ width: '100%' }} useResizeHandler config={{ displayModeBar: false }}
            />
            <Plot
              data={[{ x: cross.rpm, y: cross.ropF, mode: 'markers', type: 'scattergl', marker: { size: 6, color: '#16a34a', opacity: 0.6 } }]}
              layout={{ title: 'RPM vs ROP', xaxis: { title: 'RPM' }, yaxis: { title: 'ROP (ft/hr)' }, margin: { t: 30, l: 50, r: 10, b: 40 }, height: 260, autosize: true }}
              style={{ width: '100%' }} useResizeHandler config={{ displayModeBar: false }}
            />
            <Plot
              data={[{ x: cross.mse, y: cross.depth, mode: 'markers', type: 'scattergl', marker: { size: 6, color: '#ea580c', opacity: 0.6 } }]}
              layout={{ title: 'MSE vs depth', xaxis: { title: 'MSE (psi)' }, yaxis: { title: 'Depth (m)', autorange: 'reversed' }, margin: { t: 30, l: 60, r: 10, b: 40 }, height: 260, autosize: true }}
              style={{ width: '100%' }} useResizeHandler config={{ displayModeBar: false }}
            />
          </div>
        )}
      </section>
    </main>
  );
}
