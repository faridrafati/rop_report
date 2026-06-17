/**
 * MseView — two linked charts:
 *  1. ROP-vs-MSE scatter (log X) with a fitted power-law curve ROP = a·MSE^-b
 *     (powerLawFit from @drilliq/shared).
 *  2. A founder / drill-off line chart (ROP vs WOB) from founderCurve(), marking
 *     the founder and optimal WOB (also shown in tonnes via klbToTonnes).
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  Legend,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { founderCurve, klbToTonnes, powerLawFit } from '@drilliq/shared';
import type { RopPoint } from '../types';
import { fmt, fmtInt } from '../ui';

interface Props {
  points: RopPoint[];
}

export function MseView({ points }: Props) {
  const mseModel = useMemo(() => {
    const pts = points
      .filter(
        (p) =>
          typeof p.mse === 'number' &&
          Number.isFinite(p.mse) &&
          p.mse! > 0 &&
          typeof p.ropFthr === 'number' &&
          Number.isFinite(p.ropFthr) &&
          p.ropFthr! > 0,
      )
      .map((p) => ({ mse: p.mse as number, rop: p.ropFthr as number }));

    if (pts.length < 2) return null;
    const fit = powerLawFit(
      pts.map((p) => p.mse),
      pts.map((p) => p.rop),
    );
    const mses = pts.map((p) => p.mse);
    const lo = Math.min(...mses);
    const hi = Math.max(...mses);
    // Curve sampled across log space.
    const curve: { mse: number; fit: number }[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const m = lo * Math.pow(hi / lo, i / steps);
      curve.push({ mse: m, fit: fit.a * Math.pow(m, -fit.b) });
    }
    return { pts, fit, curve, lo, hi };
  }, [points]);

  const founderModel = useMemo(() => {
    const pts = points
      .filter(
        (p) =>
          typeof p.wob === 'number' &&
          Number.isFinite(p.wob) &&
          typeof p.ropFthr === 'number' &&
          Number.isFinite(p.ropFthr),
      )
      .map((p) => ({ wob: p.wob as number, rop: p.ropFthr as number }));
    if (pts.length < 3) return null;
    return founderCurve(pts);
  }, [points]);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-800">
          ROP vs MSE (power-law fit)
        </h3>
        {mseModel ? (
          <>
            <p className="mb-2 text-xs text-gray-500">
              ROP = {fmt(mseModel.fit.a, 2)} · MSE^−{fmt(mseModel.fit.b, 3)} (R² ={' '}
              {fmt(mseModel.fit.r2, 3)}, n = {mseModel.fit.n})
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart margin={{ top: 8, right: 24, bottom: 32, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="mse"
                  name="MSE"
                  scale="log"
                  domain={['dataMin', 'dataMax']}
                  allowDuplicatedCategory={false}
                  tickFormatter={(v: number) => fmtInt(v)}
                  label={{ value: 'MSE (psi, log)', position: 'bottom', offset: 12 }}
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
                    n === 'MSE' ? `${fmtInt(v)} psi` : `${fmt(v)} ft/hr`
                  }
                />
                <Legend verticalAlign="top" />
                <Scatter
                  name="runs"
                  data={mseModel.pts}
                  dataKey="rop"
                  fill="#2563eb"
                  fillOpacity={0.6}
                />
                <Line
                  name="power-law fit"
                  type="monotone"
                  data={mseModel.curve}
                  dataKey="fit"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="text-sm text-gray-500">
            Need ≥2 points with positive MSE and ROP.
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-800">
          Founder / drill-off curve (ROP vs WOB)
        </h3>
        {founderModel && founderModel.curve.length >= 2 ? (
          <>
            <p className="mb-2 text-xs text-gray-500">
              {founderModel.optimalWob != null ? (
                <>
                  Optimal WOB ≈ {fmtInt(founderModel.optimalWob)} lbf (
                  {fmt(klbToTonnes(founderModel.optimalWob / 1000), 1)} t)
                </>
              ) : (
                'No clear optimal WOB detected'
              )}
              {founderModel.founderWob != null ? (
                <>
                  {' · '}Founder WOB ≈ {fmtInt(founderModel.founderWob)} lbf (
                  {fmt(klbToTonnes(founderModel.founderWob / 1000), 1)} t)
                </>
              ) : null}
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                data={founderModel.curve}
                margin={{ top: 8, right: 24, bottom: 32, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="wob"
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => fmtInt(v)}
                  label={{ value: 'WOB (lbf)', position: 'bottom', offset: 12 }}
                />
                <YAxis
                  label={{ value: 'mean ROP (ft/hr)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  formatter={(v: number, n: string) =>
                    n === 'rop' ? `${fmt(v)} ft/hr` : v
                  }
                  labelFormatter={(l: number) => `WOB ${fmtInt(l)} lbf`}
                />
                <Legend verticalAlign="top" />
                <Line
                  type="monotone"
                  dataKey="rop"
                  name="mean ROP"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                {founderModel.optimalWob != null ? (
                  <ReferenceLine
                    x={founderModel.optimalWob}
                    stroke="#2563eb"
                    strokeDasharray="4 4"
                    label={{ value: 'optimal', position: 'top', fill: '#2563eb', fontSize: 11 }}
                  />
                ) : null}
                {founderModel.founderWob != null ? (
                  <ReferenceLine
                    x={founderModel.founderWob}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                    label={{ value: 'founder', position: 'top', fill: '#dc2626', fontSize: 11 }}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="text-sm text-gray-500">
            Need ≥3 points with WOB and ROP across a WOB range to bin a drill-off curve.
          </div>
        )}
      </section>
    </div>
  );
}
