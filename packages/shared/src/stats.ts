/**
 * Statistical primitives for the ROP-optimization analytics (fits, correlation,
 * outlier fences). Pure functions, no dependencies. Standalone — DrillIQ owns
 * this code (ported/rebuilt, not imported from any other project).
 */

export interface LinearFit {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
}

/** Ordinary least-squares linear fit y = slope·x + intercept. */
export function linearFit(xs: number[], ys: number[]): LinearFit {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0, n };
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!, y = ys[i]!;
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const rNum = n * sxy - sx * sy;
  const rDen = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  const r = rDen === 0 ? 0 : rNum / rDen;
  return { slope, intercept, r2: r * r, n };
}

export interface PowerLawFit {
  a: number;
  b: number;
  r2: number;
  n: number;
}

/**
 * Power-law fit ROP = a·x^(−b) via a linear fit on logs: ln y = ln a − b·ln x.
 * Used for the ROP-vs-MSE relationship. Only positive (x,y) pairs are used.
 */
export function powerLawFit(xs: number[], ys: number[]): PowerLawFit {
  const lx: number[] = [], ly: number[] = [];
  const n0 = Math.min(xs.length, ys.length);
  for (let i = 0; i < n0; i++) {
    const x = xs[i]!, y = ys[i]!;
    if (x > 0 && y > 0) { lx.push(Math.log(x)); ly.push(Math.log(y)); }
  }
  const fit = linearFit(lx, ly);
  return { a: Math.exp(fit.intercept), b: -fit.slope, r2: fit.r2, n: fit.n };
}

/** Spearman rank correlation ρ ∈ [-1, 1] (Pearson of average-tie ranks). */
export function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const rank = (arr: number[]): number[] => {
    const idx = arr.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const ranks = new Array<number>(arr.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      const avg = (i + j) / 2 + 1; // average rank (1-based) for ties
      for (let k = i; k <= j; k++) ranks[idx[k]![1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs.slice(0, n));
  const ry = rank(ys.slice(0, n));
  return linearFit(rx, ry).slope === 0 && false ? 0 : pearson(rx, ry);
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!, y = ys[i]!;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den === 0 ? 0 : num / den;
}

export const mean = (arr: number[]): number =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

/** Linear-interpolated quantile q ∈ [0,1] over a numeric array. */
export function quantile(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (pos - lo) * (s[hi]! - s[lo]!);
}

export const median = (arr: number[]): number => quantile(arr, 0.5);

export interface IqrFence {
  q1: number;
  q3: number;
  lo: number;
  hi: number;
}

/** Tukey IQR fence (k=1.5 default) for outlier screening. */
export function iqrFence(arr: number[], k = 1.5): IqrFence {
  const q1 = quantile(arr, 0.25);
  const q3 = quantile(arr, 0.75);
  const iqr = q3 - q1;
  return { q1, q3, lo: q1 - k * iqr, hi: q3 + k * iqr };
}

/** Footage-weighted mean (e.g. overall ROP weighted by meters drilled). */
export function weightedMean(values: number[], weights: number[]): number {
  let num = 0, den = 0;
  const n = Math.min(values.length, weights.length);
  for (let i = 0; i < n; i++) { num += values[i]! * weights[i]!; den += weights[i]!; }
  return den === 0 ? 0 : num / den;
}
