/**
 * EconomicsView — cost-per-meter vs ROP, grouped by bit class (PDC / roller).
 *
 * The user supplies rig $/day, per-class bit prices, trip speed, handling hours
 * and whether to include trip time. Economics come from @drilliq/shared
 * (rigUsdPerHr, tripHours, costPerMeter, tripAdjustedRop). A ranked table lists
 * the cheapest runs first.
 */
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  costPerMeter,
  rigUsdPerHr,
  tripAdjustedRop,
  tripHours,
} from '@drilliq/shared';
import type { RopPoint } from '../types';
import { fmt, fmtInt } from '../ui';

interface Props {
  points: RopPoint[];
}

interface Row {
  bitRunId: string;
  wellName: string;
  bitSize: string;
  bitClass: 'PDC' | 'roller';
  meters: number;
  drillHr: number;
  tripHr: number;
  costPerMeter: number;
  effRop: number; // m/hr
}

const NUM = (s: string, fallback: number): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
};

export function EconomicsView({ points }: Props) {
  const [rigUsdPerDay, setRigUsdPerDay] = useState('60000');
  const [pdcPrice, setPdcPrice] = useState('45000');
  const [rollerPrice, setRollerPrice] = useState('18000');
  const [tripSpeed, setTripSpeed] = useState('300'); // m/hr
  const [handlingHr, setHandlingHr] = useState('2');
  const [includeTrip, setIncludeTrip] = useState(true);

  const model = useMemo(() => {
    const rigHr = rigUsdPerHr(NUM(rigUsdPerDay, 0));
    const tripV = NUM(tripSpeed, 300);
    const handV = NUM(handlingHr, 2);
    const pdcUsd = NUM(pdcPrice, 0);
    const rollerUsd = NUM(rollerPrice, 0);

    const rows: Row[] = [];
    for (const p of points) {
      const meters = p.meters;
      const drillHr = p.bitHour;
      if (
        typeof meters !== 'number' ||
        !Number.isFinite(meters) ||
        meters <= 0 ||
        typeof drillHr !== 'number' ||
        !Number.isFinite(drillHr) ||
        drillHr <= 0 ||
        (p.bitClass !== 'PDC' && p.bitClass !== 'roller')
      ) {
        continue;
      }
      const depthM =
        typeof p.depthOut === 'number' && Number.isFinite(p.depthOut)
          ? p.depthOut
          : meters;
      const tripHr = includeTrip
        ? tripHours({ depthM, tripSpeedMHr: tripV, handlingHr: handV })
        : 0;
      const bitUsd = p.bitClass === 'PDC' ? pdcUsd : rollerUsd;
      const cpm = costPerMeter({
        bitUsd,
        rigUsdPerHr: rigHr,
        drillHr,
        tripHr,
        meterageM: meters,
      });
      const effRop = tripAdjustedRop({ meterageM: meters, drillHr, tripHr });
      rows.push({
        bitRunId: p.bitRunId,
        wellName: p.wellName,
        bitSize: p.bitSize ?? '—',
        bitClass: p.bitClass,
        meters,
        drillHr,
        tripHr,
        costPerMeter: cpm,
        effRop,
      });
    }

    rows.sort((a, b) => a.costPerMeter - b.costPerMeter);

    // Grouped means by class.
    const byClass = (cls: 'PDC' | 'roller') => {
      const sub = rows.filter((r) => r.bitClass === cls);
      if (!sub.length) return null;
      const cpm = sub.reduce((s, r) => s + r.costPerMeter, 0) / sub.length;
      const rop = sub.reduce((s, r) => s + r.effRop, 0) / sub.length;
      return { cpm, rop, n: sub.length };
    };
    const grouped = [
      { name: 'PDC', ...(byClass('PDC') ?? { cpm: 0, rop: 0, n: 0 }) },
      { name: 'roller', ...(byClass('roller') ?? { cpm: 0, rop: 0, n: 0 }) },
    ].filter((g) => g.n > 0);

    return { rows, grouped };
  }, [
    points,
    rigUsdPerDay,
    pdcPrice,
    rollerPrice,
    tripSpeed,
    handlingHr,
    includeTrip,
  ]);

  const field = (
    label: string,
    value: string,
    set: (s: string) => void,
    suffix?: string,
  ) => (
    <label className="flex flex-col text-xs text-gray-600">
      <span className="mb-1">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => set(e.target.value)}
          className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
        />
        {suffix ? <span className="text-gray-400">{suffix}</span> : null}
      </span>
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        {field('Rig rate', rigUsdPerDay, setRigUsdPerDay, '$/day')}
        {field('PDC bit price', pdcPrice, setPdcPrice, '$')}
        {field('Roller bit price', rollerPrice, setRollerPrice, '$')}
        {field('Trip speed', tripSpeed, setTripSpeed, 'm/hr')}
        {field('Handling', handlingHr, setHandlingHr, 'hr')}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeTrip}
            onChange={(e) => setIncludeTrip(e.target.checked)}
          />
          Include trip time
        </label>
      </div>

      {model.grouped.length ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-800">
              Mean cost per meter by bit class
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={model.grouped} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v: number) => `$${fmtInt(v)}`} />
                <Tooltip formatter={(v: number) => `$${fmt(v, 2)}/m`} />
                <Legend />
                <Bar dataKey="cpm" name="cost/m">
                  {model.grouped.map((g) => (
                    <Cell key={g.name} fill={g.name === 'PDC' ? '#2563eb' : '#ea580c'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-800">
              Mean effective ROP by bit class
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={model.grouped} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v: number) => fmt(v, 1)} />
                <Tooltip formatter={(v: number) => `${fmt(v, 1)} m/hr`} />
                <Legend />
                <Bar dataKey="rop" name="eff. ROP">
                  {model.grouped.map((g) => (
                    <Cell key={g.name} fill={g.name === 'PDC' ? '#2563eb' : '#ea580c'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          No runs with meterage and drilling hours to cost out.
        </div>
      )}

      {model.rows.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">
            Ranked runs (cheapest first)
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Well</th>
                  <th className="px-3 py-2">Bit size</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2 text-right">Meters</th>
                  <th className="px-3 py-2 text-right">Drill hr</th>
                  <th className="px-3 py-2 text-right">Trip hr</th>
                  <th className="px-3 py-2 text-right">Eff. ROP (m/hr)</th>
                  <th className="px-3 py-2 text-right">Cost/m ($)</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((r) => (
                  <tr key={r.bitRunId} className="border-b border-gray-100">
                    <td className="px-3 py-1.5 text-gray-900">{r.wellName}</td>
                    <td className="px-3 py-1.5 text-gray-700">{r.bitSize}</td>
                    <td className="px-3 py-1.5 text-gray-700">{r.bitClass}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmtInt(r.meters)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(r.drillHr, 1)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(r.tripHr, 1)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(r.effRop, 1)}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-900">
                      {fmt(r.costPerMeter, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
