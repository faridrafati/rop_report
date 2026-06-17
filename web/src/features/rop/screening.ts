/**
 * Client-side IQR outlier screening for ROP operating points.
 *
 * A point is dropped if ANY of its rop / wob / rpm / mse values falls outside
 * that metric's Tukey IQR fence. Fences are computed only over the finite values
 * present for each metric (nulls are ignored when fencing, and a null value for
 * a metric never disqualifies the point on that metric).
 *
 * Math comes from @drilliq/shared (iqrFence) — we do NOT reimplement it.
 */
import { iqrFence } from '@drilliq/shared';
import type { IqrFence } from '@drilliq/shared';
import type { RopPoint } from './types';

const METRICS = ['ropFthr', 'wob', 'rpm', 'mse'] as const;
type Metric = (typeof METRICS)[number];

export interface ScreenResult {
  kept: RopPoint[];
  screened: number;
}

function finiteValues(points: RopPoint[], metric: Metric): number[] {
  const out: number[] = [];
  for (const p of points) {
    const v = p[metric];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * Screen outliers unless `includeOutliers` is set. Returns the surviving points
 * and how many were screened out.
 */
export function screenOutliers(
  points: RopPoint[],
  includeOutliers: boolean,
): ScreenResult {
  if (includeOutliers || points.length < 4) {
    return { kept: points, screened: 0 };
  }
  const fences = {} as Record<Metric, IqrFence | null>;
  for (const m of METRICS) {
    const vals = finiteValues(points, m);
    fences[m] = vals.length >= 4 ? iqrFence(vals) : null;
  }

  const kept = points.filter((p) => {
    for (const m of METRICS) {
      const fence = fences[m];
      const v = p[m];
      if (fence && typeof v === 'number' && Number.isFinite(v)) {
        if (v < fence.lo || v > fence.hi) return false;
      }
    }
    return true;
  });

  return { kept, screened: points.length - kept.length };
}
