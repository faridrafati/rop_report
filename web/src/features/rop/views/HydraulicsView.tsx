/**
 * HydraulicsView — ROP vs HSI scatter with a linear trend (linearFit), the
 * Spearman rank correlation ρ, and a shaded HSI optimum band (2.5–5.0). Counts
 * of points below / within / above the band are reported. Stats from @drilliq/shared.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { isHsiOptimal, linearFit, spearman } from '@drilliq/shared';
import type { RopPoint } from '../types';
import { fmt, fmtInt } from '../ui';

interface Props {
  points: RopPoint[];
}

export function HydraulicsView({ points }: Props) {
  const model = useMemo(() => {
    const pts = points
      .filter(
        (p) =>
          typeof p.hsi === 'number' &&
          Number.isFinite(p.hsi) &&
          typeof p.ropFthr === 'number' &&
          Number.isFinite(p.ropFthr),
      )
      .map((p) => ({ hsi: p.hsi as number, rop: p.ropFthr as number }));
    if (pts.length < 2) return null;

    const xs = pts.map((p) => p.hsi);
    const ys = pts.map((p) => p.rop);
    const fit = linearFit(xs, ys);
    const rho = spearman(xs, ys);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const trend = [
      { hsi: lo, fit: fit.slope * lo + fit.intercept },
      { hsi: hi, fit: fit.slope * hi + fit.intercept },
    ];

    let below = 0;
    let within = 0;
    let above = 0;
    for (const p of pts) {
      if (isHsiOptimal(p.hsi)) within += 1;
      else if (p.hsi < 2.5) below += 1;
      else above += 1;
    }

    return { pts, fit, rho, trend, below, within, above, lo, hi };
  }, [points]);

  if (!model) {
    return (
      <div className="text-sm text-gray-500">Need ≥2 points with HSI and ROP.</div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-600">
        <span>
          Trend slope {fmt(model.fit.slope, 2)} ft/hr per HSI · R² {fmt(model.fit.r2, 3)}
        </span>
        <span>Spearman ρ {fmt(model.rho, 3)}</span>
        <span>
          Below 2.5: {fmtInt(model.below)} · Within 2.5–5.0: {fmtInt(model.within)} · Above 5.0:{' '}
          {fmtInt(model.above)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart margin={{ top: 8, right: 24, bottom: 32, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="hsi"
            name="HSI"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => fmt(v, 1)}
            label={{ value: 'HSI (hhp/in²)', position: 'bottom', offset: 12 }}
          />
          <YAxis
            type="number"
            name="ROP"
            label={{ value: 'ROP (ft/hr)', angle: -90, position: 'insideLeft' }}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number, n: string) =>
              n === 'HSI' ? fmt(v, 2) : `${fmt(v)} ft/hr`
            }
          />
          <Legend verticalAlign="top" />
          <ReferenceArea
            x1={2.5}
            x2={5.0}
            fill="#16a34a"
            fillOpacity={0.1}
            label={{ value: 'optimum 2.5–5.0', position: 'insideTop', fontSize: 11 }}
          />
          <Scatter
            name="runs"
            data={model.pts}
            dataKey="rop"
            fill="#0891b2"
            fillOpacity={0.65}
          />
          <Line
            name="linear trend"
            type="linear"
            data={model.trend}
            dataKey="fit"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
