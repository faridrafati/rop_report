/**
 * ContourView — WOB×RPM heatmap of mean ROP, hand-rolled in SVG.
 *
 * WOB is binned into ~12 columns, RPM into ~10 rows; each cell is colored cool→
 * warm by mean ROP (ft/hr). The best cell with ≥2 records gets a gold outline.
 * A colorbar legend and an optional raw-scatter overlay are included.
 */
import { useMemo, useState } from 'react';
import { mean } from '@drilliq/shared';
import type { RopPoint } from '../types';
import { coolWarm, fmt, fmtInt } from '../ui';

interface Props {
  points: RopPoint[];
}

const WOB_BINS = 12;
const RPM_BINS = 10;

interface Cell {
  col: number; // WOB bin index
  row: number; // RPM bin index
  meanRop: number;
  n: number;
}

interface OverlayPoint {
  x: number; // wob
  y: number; // rpm
  rop: number;
}

export function ContourView({ points }: Props) {
  const [showScatter, setShowScatter] = useState(false);

  const model = useMemo(() => {
    const valid = points.filter(
      (p) =>
        typeof p.wob === 'number' &&
        Number.isFinite(p.wob) &&
        typeof p.rpm === 'number' &&
        Number.isFinite(p.rpm) &&
        typeof p.ropFthr === 'number' &&
        Number.isFinite(p.ropFthr),
    ) as (RopPoint & { wob: number; rpm: number; ropFthr: number })[];

    if (valid.length < 2) return null;

    const wobs = valid.map((p) => p.wob);
    const rpms = valid.map((p) => p.rpm);
    const wobMin = Math.min(...wobs);
    const wobMax = Math.max(...wobs);
    const rpmMin = Math.min(...rpms);
    const rpmMax = Math.max(...rpms);
    const wobW = wobMax > wobMin ? (wobMax - wobMin) / WOB_BINS : 1;
    const rpmW = rpmMax > rpmMin ? (rpmMax - rpmMin) / RPM_BINS : 1;

    const acc: { rop: number[]; }[][] = Array.from({ length: RPM_BINS }, () =>
      Array.from({ length: WOB_BINS }, () => ({ rop: [] as number[] })),
    );
    const overlay: OverlayPoint[] = [];

    for (const p of valid) {
      let col = Math.floor((p.wob - wobMin) / wobW);
      let row = Math.floor((p.rpm - rpmMin) / rpmW);
      if (col >= WOB_BINS) col = WOB_BINS - 1;
      if (col < 0) col = 0;
      if (row >= RPM_BINS) row = RPM_BINS - 1;
      if (row < 0) row = 0;
      acc[row]![col]!.rop.push(p.ropFthr);
      overlay.push({ x: p.wob, y: p.rpm, rop: p.ropFthr });
    }

    const cells: Cell[] = [];
    let ropMin = Infinity;
    let ropMax = -Infinity;
    for (let r = 0; r < RPM_BINS; r++) {
      for (let c = 0; c < WOB_BINS; c++) {
        const bucket = acc[r]![c]!.rop;
        if (bucket.length) {
          const m = mean(bucket);
          cells.push({ col: c, row: r, meanRop: m, n: bucket.length });
          if (m < ropMin) ropMin = m;
          if (m > ropMax) ropMax = m;
        }
      }
    }

    // Best cell with ≥2 records.
    let best: Cell | null = null;
    for (const cell of cells) {
      if (cell.n >= 2 && (!best || cell.meanRop > best.meanRop)) best = cell;
    }

    return {
      cells,
      best,
      overlay,
      wobMin,
      wobMax,
      rpmMin,
      rpmMax,
      wobW,
      rpmW,
      ropMin: Number.isFinite(ropMin) ? ropMin : 0,
      ropMax: Number.isFinite(ropMax) ? ropMax : 1,
    };
  }, [points]);

  if (!model) {
    return (
      <div className="text-sm text-gray-500">
        Need at least 2 points with WOB, RPM and ROP to render the contour.
      </div>
    );
  }

  // SVG layout.
  const PAD_L = 64;
  const PAD_B = 48;
  const PAD_T = 16;
  const PAD_R = 16;
  const plotW = 720;
  const plotH = 420;
  const cellW = plotW / WOB_BINS;
  const cellH = plotH / RPM_BINS;
  const W = PAD_L + plotW + PAD_R;
  const H = PAD_T + plotH + PAD_B;

  const ropSpan = model.ropMax - model.ropMin || 1;
  const norm = (v: number): number => (v - model.ropMin) / ropSpan;

  // Cell y is inverted (RPM increases upward).
  const cellX = (col: number): number => PAD_L + col * cellW;
  const cellY = (row: number): number => PAD_T + (RPM_BINS - 1 - row) * cellH;

  const wobAt = (col: number): number => model.wobMin + col * model.wobW;
  const rpmAt = (row: number): number => model.rpmMin + row * model.rpmW;

  const overlayX = (wob: number): number =>
    PAD_L + ((wob - model.wobMin) / ((model.wobMax - model.wobMin) || 1)) * plotW;
  const overlayY = (rpm: number): number =>
    PAD_T + plotH - ((rpm - model.rpmMin) / ((model.rpmMax - model.rpmMin) || 1)) * plotH;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Mean ROP (ft/hr) by WOB (lbf) × RPM — {fmtInt(model.cells.length)} populated cells
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showScatter}
            onChange={(e) => setShowScatter(e.target.checked)}
          />
          Scatter overlay
        </label>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-4xl"
        role="img"
        aria-label="WOB by RPM mean ROP heatmap"
      >
        {/* cells */}
        {model.cells.map((cell) => (
          <rect
            key={`${cell.row}-${cell.col}`}
            x={cellX(cell.col)}
            y={cellY(cell.row)}
            width={cellW}
            height={cellH}
            fill={coolWarm(norm(cell.meanRop))}
            stroke="#ffffff"
            strokeWidth={0.5}
          >
            <title>
              {`WOB ${fmtInt(wobAt(cell.col))}–${fmtInt(wobAt(cell.col + 1))} lbf, ` +
                `RPM ${fmtInt(rpmAt(cell.row))}–${fmtInt(rpmAt(cell.row + 1))}\n` +
                `mean ROP ${fmt(cell.meanRop)} ft/hr (n=${cell.n})`}
            </title>
          </rect>
        ))}

        {/* gold outline best cell */}
        {model.best ? (
          <rect
            x={cellX(model.best.col) + 1}
            y={cellY(model.best.row) + 1}
            width={cellW - 2}
            height={cellH - 2}
            fill="none"
            stroke="#d4af37"
            strokeWidth={3}
          />
        ) : null}

        {/* optional scatter overlay */}
        {showScatter
          ? model.overlay.map((p, i) => (
              <circle
                key={i}
                cx={overlayX(p.x)}
                cy={overlayY(p.y)}
                r={2.5}
                fill="#111827"
                fillOpacity={0.55}
              />
            ))
          : null}

        {/* axes frame */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={plotW}
          height={plotH}
          fill="none"
          stroke="#9ca3af"
          strokeWidth={1}
        />

        {/* X axis ticks (WOB) */}
        {Array.from({ length: 5 }, (_, i) => {
          const frac = i / 4;
          const x = PAD_L + frac * plotW;
          const wob = model.wobMin + frac * (model.wobMax - model.wobMin);
          return (
            <g key={`xt-${i}`}>
              <line x1={x} y1={PAD_T + plotH} x2={x} y2={PAD_T + plotH + 5} stroke="#6b7280" />
              <text
                x={x}
                y={PAD_T + plotH + 18}
                textAnchor="middle"
                className="fill-gray-600"
                fontSize={11}
              >
                {fmtInt(wob)}
              </text>
            </g>
          );
        })}
        <text
          x={PAD_L + plotW / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-gray-700"
          fontSize={12}
        >
          WOB (lbf)
        </text>

        {/* Y axis ticks (RPM) */}
        {Array.from({ length: 5 }, (_, i) => {
          const frac = i / 4;
          const y = PAD_T + plotH - frac * plotH;
          const rpm = model.rpmMin + frac * (model.rpmMax - model.rpmMin);
          return (
            <g key={`yt-${i}`}>
              <line x1={PAD_L - 5} y1={y} x2={PAD_L} y2={y} stroke="#6b7280" />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-gray-600"
                fontSize={11}
              >
                {fmtInt(rpm)}
              </text>
            </g>
          );
        })}
        <text
          x={16}
          y={PAD_T + plotH / 2}
          textAnchor="middle"
          className="fill-gray-700"
          fontSize={12}
          transform={`rotate(-90 16 ${PAD_T + plotH / 2})`}
        >
          RPM
        </text>
      </svg>

      {/* colorbar legend */}
      <Colorbar min={model.ropMin} max={model.ropMax} />
      {model.best ? (
        <div className="mt-2 text-xs text-gray-600">
          <span className="mr-1 inline-block h-3 w-3 rounded-sm border-2 border-[#d4af37] align-middle" />
          Best cell: mean ROP {fmt(model.best.meanRop)} ft/hr at WOB ≈{' '}
          {fmtInt(wobAt(model.best.col) + model.wobW / 2)} lbf, RPM ≈{' '}
          {fmtInt(rpmAt(model.best.row) + model.rpmW / 2)} (n={model.best.n})
        </div>
      ) : null}
    </div>
  );
}

function Colorbar({ min, max }: { min: number; max: number }) {
  const stops = Array.from({ length: 24 }, (_, i) => i / 23);
  return (
    <div className="mt-3 flex max-w-md items-center gap-3">
      <span className="text-xs text-gray-500">{fmt(min)} ft/hr</span>
      <div className="flex h-3 flex-1 overflow-hidden rounded">
        {stops.map((t, i) => (
          <div key={i} className="flex-1" style={{ background: coolWarm(t) }} />
        ))}
      </div>
      <span className="text-xs text-gray-500">{fmt(max)} ft/hr</span>
    </div>
  );
}
