/**
 * ScatterView — ROP vs WOB and ROP vs RPM scatter plots, colored by bit size.
 * One Recharts <Scatter> series per distinct bit size so the legend doubles as
 * the color key.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { RopPoint } from '../types';
import { colorForIndex, fmt, fmtInt } from '../ui';

interface Props {
  points: RopPoint[];
}

interface SeriesPoint {
  wob: number;
  rpm: number;
  rop: number;
  well: string;
}

function buildSeries(points: RopPoint[], xKey: 'wob' | 'rpm') {
  const groups = new Map<string, SeriesPoint[]>();
  for (const p of points) {
    const x = p[xKey];
    if (
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      typeof p.ropFthr !== 'number' ||
      !Number.isFinite(p.ropFthr)
    ) {
      continue;
    }
    const key = p.bitSize ?? 'Unknown';
    const arr = groups.get(key) ?? [];
    arr.push({
      wob: typeof p.wob === 'number' ? p.wob : NaN,
      rpm: typeof p.rpm === 'number' ? p.rpm : NaN,
      rop: p.ropFthr,
      well: p.wellName,
    });
    groups.set(key, arr);
  }
  return [...groups.entries()];
}

function Plot({
  title,
  xKey,
  xLabel,
  series,
}: {
  title: string;
  xKey: 'wob' | 'rpm';
  xLabel: string;
  series: [string, SeriesPoint[]][];
}) {
  if (!series.length) {
    return <div className="text-sm text-gray-500">No points with {xLabel} and ROP.</div>;
  }
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-gray-800">{title}</h3>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 32, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey={xKey}
            name={xLabel}
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => fmtInt(v)}
            label={{ value: xLabel, position: 'bottom', offset: 12 }}
          />
          <YAxis
            type="number"
            dataKey="rop"
            name="ROP"
            label={{ value: 'ROP (ft/hr)', angle: -90, position: 'insideLeft' }}
          />
          <ZAxis range={[36, 36]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number, n: string) =>
              n === 'ROP' ? `${fmt(v)} ft/hr` : fmtInt(v)
            }
          />
          <Legend verticalAlign="top" />
          {series.map(([size, data], i) => (
            <Scatter
              key={size}
              name={size}
              data={data}
              fill={colorForIndex(i)}
              fillOpacity={0.7}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScatterView({ points }: Props) {
  const wobSeries = useMemo(() => buildSeries(points, 'wob'), [points]);
  const rpmSeries = useMemo(() => buildSeries(points, 'rpm'), [points]);

  return (
    <div className="space-y-8">
      <Plot title="ROP vs WOB" xKey="wob" xLabel="WOB (lbf)" series={wobSeries} />
      <Plot title="ROP vs RPM" xKey="rpm" xLabel="RPM" series={rpmSeries} />
    </div>
  );
}
