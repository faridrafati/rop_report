/**
 * Small presentation helpers for the ROP views: number formatting, a cool→warm
 * color ramp for heatmaps, and a stable categorical palette for bit sizes.
 */

/** Format a number to `digits` decimals; em-dash for null/NaN. */
export function fmt(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Format an integer with thousands separators; em-dash for null. */
export function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString('en-US');
}

/**
 * Cool→warm color ramp for t ∈ [0,1]: blue (cool/slow) → cyan → green →
 * yellow → red (warm/fast). Returns an `rgb(...)` string.
 */
export function coolWarm(t: number): string {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  // Piecewise-linear over 5 control colors.
  const stops: [number, number, number][] = [
    [37, 99, 235], // blue-600
    [6, 182, 212], // cyan-500
    [34, 197, 94], // green-500
    [234, 179, 8], // yellow-500
    [239, 68, 68], // red-500
  ];
  const seg = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const ch = (k: number): number => Math.round(a[k]! + (b[k]! - a[k]!) * f);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/** Stable categorical palette (Tailwind-ish hues) for series like bit sizes. */
const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#ea580c', // orange
  '#9333ea', // purple
  '#0891b2', // cyan
  '#dc2626', // red
  '#ca8a04', // amber
  '#db2777', // pink
  '#4f46e5', // indigo
  '#65a30d', // lime
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length]!;
}

/**
 * Map distinct category values to stable colors in the order they appear.
 * Returns a lookup function.
 */
export function categoricalColors(values: (string | null)[]): (v: string | null) => string {
  const order: string[] = [];
  for (const v of values) {
    const key = v ?? 'Unknown';
    if (!order.includes(key)) order.push(key);
  }
  const map = new Map<string, string>();
  order.forEach((k, i) => map.set(k, colorForIndex(i)));
  return (v: string | null) => map.get(v ?? 'Unknown') ?? '#94a3b8';
}
