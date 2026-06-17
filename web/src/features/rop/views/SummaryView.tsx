/**
 * SummaryView — headline KPI cards for the screened point set.
 * All statistics come from @drilliq/shared (weightedMean, median).
 */
import { weightedMean, median } from '@drilliq/shared';
import type { RopPoint } from '../types';
import { fmt, fmtInt } from '../ui';

interface Props {
  points: RopPoint[];
}

interface Kpi {
  label: string;
  value: string;
  sub?: string;
}

function Card({ kpi }: { kpi: Kpi }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {kpi.label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{kpi.value}</div>
      {kpi.sub ? <div className="mt-1 text-xs text-gray-500">{kpi.sub}</div> : null}
    </div>
  );
}

export function SummaryView({ points }: Props) {
  if (!points.length) {
    return <div className="text-sm text-gray-500">No points to summarize.</div>;
  }

  // Footage-weighted overall ROP (m/hr). Use points with both ROP and meterage.
  const ropVals: number[] = [];
  const weights: number[] = [];
  let totalMeters = 0;
  for (const p of points) {
    if (typeof p.meters === 'number' && Number.isFinite(p.meters) && p.meters > 0) {
      totalMeters += p.meters;
      if (typeof p.ropMhr === 'number' && Number.isFinite(p.ropMhr)) {
        ropVals.push(p.ropMhr);
        weights.push(p.meters);
      }
    }
  }
  const overallRop = ropVals.length ? weightedMean(ropVals, weights) : null;

  // Best / slowest run by ROP (m/hr).
  const withRop = points.filter(
    (p): p is RopPoint & { ropMhr: number } =>
      typeof p.ropMhr === 'number' && Number.isFinite(p.ropMhr),
  );
  const best = withRop.length
    ? withRop.reduce((a, b) => (b.ropMhr > a.ropMhr ? b : a))
    : null;
  const slowest = withRop.length
    ? withRop.reduce((a, b) => (b.ropMhr < a.ropMhr ? b : a))
    : null;

  // PDC / roller split.
  let pdc = 0;
  let roller = 0;
  for (const p of points) {
    if (p.bitClass === 'PDC') pdc += 1;
    else if (p.bitClass === 'roller') roller += 1;
  }

  // Median MSE.
  const mseVals = points
    .map((p) => p.mse)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const medMse = mseVals.length ? median(mseVals) : null;

  const kpis: Kpi[] = [
    {
      label: 'Overall ROP (footage-weighted)',
      value: overallRop != null ? `${fmt(overallRop, 1)} m/hr` : '—',
      sub: `${fmtInt(ropVals.length)} runs with meterage`,
    },
    {
      label: 'Best run',
      value: best ? `${fmt(best.ropMhr, 1)} m/hr` : '—',
      sub: best ? `${best.wellName} · ${best.bitSize ?? '—'}` : undefined,
    },
    {
      label: 'Slowest run',
      value: slowest ? `${fmt(slowest.ropMhr, 1)} m/hr` : '—',
      sub: slowest ? `${slowest.wellName} · ${slowest.bitSize ?? '—'}` : undefined,
    },
    {
      label: 'Total footage',
      value: `${fmtInt(totalMeters)} m`,
      sub: `${fmtInt(points.length)} bit runs`,
    },
    {
      label: 'Bit runs (PDC / roller)',
      value: `${fmtInt(pdc)} / ${fmtInt(roller)}`,
      sub: 'by bit class',
    },
    {
      label: 'Median MSE',
      value: medMse != null ? `${fmtInt(medMse)} psi` : '—',
      sub: `${fmtInt(mseVals.length)} runs with MSE`,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {kpis.map((k) => (
        <Card key={k.label} kpi={k} />
      ))}
    </div>
  );
}
