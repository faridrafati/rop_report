/**
 * BySizeView — horizontal bar chart of mean ROP (m/hr) per bit size, widest →
 * narrowest. Bit-size parsing/ordering uses parseBitSizeInches from @drilliq/shared.
 */
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { mean, parseBitSizeInches } from '@drilliq/shared';
import type { RopPoint } from '../types';
import { colorForIndex, fmt, fmtInt } from '../ui';

interface Props {
  points: RopPoint[];
}

interface Row {
  size: string;
  meanRop: number;
  n: number;
  inches: number;
}

export function BySizeView({ points }: Props) {
  const rows = useMemo<Row[]>(() => {
    const groups = new Map<string, number[]>();
    for (const p of points) {
      if (typeof p.ropMhr !== 'number' || !Number.isFinite(p.ropMhr)) continue;
      const key = p.bitSize ?? 'Unknown';
      const arr = groups.get(key) ?? [];
      arr.push(p.ropMhr);
      groups.set(key, arr);
    }
    const out: Row[] = [];
    for (const [size, vals] of groups) {
      out.push({
        size,
        meanRop: mean(vals),
        n: vals.length,
        inches: parseBitSizeInches(size) ?? -1,
      });
    }
    // Widest → narrowest; unknown sizes last.
    out.sort((a, b) => b.inches - a.inches);
    return out;
  }, [points]);

  if (!rows.length) {
    return <div className="text-sm text-gray-500">No points with ROP and a bit size.</div>;
  }

  const height = Math.max(180, rows.length * 44 + 40);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-800">
        Mean ROP (m/hr) by bit size
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 8, right: 48, bottom: 8, left: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => fmt(v, 1)}
            label={{ value: 'mean ROP (m/hr)', position: 'bottom', offset: 0 }}
          />
          <YAxis type="category" dataKey="size" width={80} />
          <Tooltip
            formatter={(v: number) => `${fmt(v, 1)} m/hr`}
            labelFormatter={(l: string) => {
              const r = rows.find((x) => x.size === l);
              return r ? `${l} (n=${fmtInt(r.n)})` : l;
            }}
          />
          <Bar dataKey="meanRop" name="mean ROP">
            {rows.map((r, i) => (
              <Cell key={r.size} fill={colorForIndex(i)} />
            ))}
            <LabelList
              dataKey="meanRop"
              position="right"
              formatter={(v: number) => fmt(v, 1)}
              className="fill-gray-600 text-xs"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
