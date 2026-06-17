/**
 * RopOptimizationTab — the standalone ROP-optimization feature.
 *
 * Left sidebar: multi-select filters (wells, hole/bit sizes, bit family, mud
 * types) + depth range + include-outliers toggle, with Show / Clear actions.
 * Header: point count, outliers screened and bit-size count. Top-right: a VIEW
 * toggle that swaps the analytics panel.
 *
 * Data is fetched via TanStack Query (POST /api/rop-optimization). Outlier
 * screening (IQR via @drilliq/shared) runs client-side unless overridden. The
 * tab works and shows an empty state gracefully when there are no rows yet.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchRopOptimization, fetchRopOptions } from './api';
import { screenOutliers } from './screening';
import type { RopOptimizationFilters, RopView } from './types';
import { fmtInt } from './ui';
import { SummaryView } from './views/SummaryView';
import { ContourView } from './views/ContourView';
import { MseView } from './views/MseView';
import { HydraulicsView } from './views/HydraulicsView';
import { EconomicsView } from './views/EconomicsView';
import { ScatterView } from './views/ScatterView';
import { BySizeView } from './views/BySizeView';
import { TableView } from './views/TableView';

const VIEWS: { id: RopView; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'contour', label: 'Contour' },
  { id: 'mse', label: 'MSE' },
  { id: 'hydraulics', label: 'Hydraulics' },
  { id: 'economics', label: 'Economics' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'bysize', label: 'By size' },
  { id: 'table', label: 'Table' },
];

type BitFamily = NonNullable<RopOptimizationFilters['bitFamilies']>[number];

interface DraftFilters {
  wellIds: string[];
  holeSizes: string[];
  bitFamilies: BitFamily[];
  mudTypeIds: string[];
  depthFrom: string;
  depthTo: string;
  includeOutliers: boolean;
}

const EMPTY_DRAFT: DraftFilters = {
  wellIds: [],
  holeSizes: [],
  bitFamilies: [],
  mudTypeIds: [],
  depthFrom: '',
  depthTo: '',
  includeOutliers: false,
};

const FALLBACK_FAMILIES: BitFamily[] = [
  'PDC',
  'TCI',
  'MILLED_TOOTH',
  'DIAMOND',
  'OTHER',
];

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function MultiSelect<T extends string>({
  title,
  options,
  selected,
  onToggle,
  labelOf,
}: {
  title: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
  labelOf?: (v: T) => string;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </legend>
      {options.length ? (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
              {labelOf ? labelOf(o.value) : o.label}
            </label>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-gray-200 p-2 text-xs text-gray-400">
          No options
        </div>
      )}
    </fieldset>
  );
}

export function RopOptimizationTab() {
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<DraftFilters | null>(null);
  const [view, setView] = useState<RopView>('summary');

  const optionsQuery = useQuery({
    queryKey: ['rop-options'],
    queryFn: fetchRopOptions,
    retry: false,
  });

  const appliedRequest = useMemo<RopOptimizationFilters | null>(() => {
    if (!applied) return null;
    const f: RopOptimizationFilters = {};
    if (applied.wellIds.length) f.wellIds = applied.wellIds;
    if (applied.holeSizes.length) f.holeSizes = applied.holeSizes;
    if (applied.bitFamilies.length) f.bitFamilies = applied.bitFamilies;
    if (applied.mudTypeIds.length) f.mudTypeIds = applied.mudTypeIds;
    const from = Number(applied.depthFrom);
    const to = Number(applied.depthTo);
    if (applied.depthFrom !== '' && Number.isFinite(from)) f.depthFrom = from;
    if (applied.depthTo !== '' && Number.isFinite(to)) f.depthTo = to;
    return f;
  }, [applied]);

  const dataQuery = useQuery({
    queryKey: ['rop-optimization', appliedRequest],
    queryFn: () => fetchRopOptimization(appliedRequest ?? {}),
    enabled: appliedRequest !== null,
    retry: false,
  });

  const screened = useMemo(() => {
    const points = dataQuery.data?.points ?? [];
    return screenOutliers(points, applied?.includeOutliers ?? false);
  }, [dataQuery.data, applied?.includeOutliers]);

  const bitSizeCount = useMemo(() => {
    const set = new Set<string>();
    for (const p of screened.kept) if (p.bitSize) set.add(p.bitSize);
    return set.size;
  }, [screened.kept]);

  const options = optionsQuery.data;
  const familyOptions = options?.bitFamilies?.length
    ? options.bitFamilies
    : FALLBACK_FAMILIES;

  const onShow = () => setApplied(draft);
  const onClear = () => {
    setDraft(EMPTY_DRAFT);
    setApplied(null);
  };

  const points = screened.kept;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            ← DrillIQ
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">ROP optimization</h1>
        </div>
        <nav className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                view === v.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 space-y-4 border-r border-gray-200 p-4">
          <MultiSelect
            title="Wells"
            options={(options?.wells ?? []).map((w) => ({ value: w.id, label: w.name }))}
            selected={draft.wellIds}
            onToggle={(v) => setDraft((d) => ({ ...d, wellIds: toggle(d.wellIds, v) }))}
          />
          <MultiSelect
            title="Bit / hole sizes"
            options={(options?.holeSizes ?? []).map((s) => ({ value: s, label: s }))}
            selected={draft.holeSizes}
            onToggle={(v) => setDraft((d) => ({ ...d, holeSizes: toggle(d.holeSizes, v) }))}
          />
          <MultiSelect
            title="Bit family"
            options={familyOptions.map((f) => ({ value: f, label: f }))}
            selected={draft.bitFamilies}
            onToggle={(v) =>
              setDraft((d) => ({ ...d, bitFamilies: toggle(d.bitFamilies, v) }))
            }
          />
          <MultiSelect
            title="Mud types"
            options={(options?.mudTypes ?? []).map((m) => ({ value: m.id, label: m.name }))}
            selected={draft.mudTypeIds}
            onToggle={(v) =>
              setDraft((d) => ({ ...d, mudTypeIds: toggle(d.mudTypeIds, v) }))
            }
          />

          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Depth range (m)
            </legend>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="from"
                value={draft.depthFrom}
                onChange={(e) => setDraft((d) => ({ ...d, depthFrom: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <span className="text-gray-400">–</span>
              <input
                type="number"
                placeholder="to"
                value={draft.depthTo}
                onChange={(e) => setDraft((d) => ({ ...d, depthTo: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.includeOutliers}
              onChange={(e) =>
                setDraft((d) => ({ ...d, includeOutliers: e.target.checked }))
              }
            />
            Include outliers (skip IQR screening)
          </label>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onShow}
              className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Show
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>

          {optionsQuery.isError ? (
            <p className="text-xs text-amber-600">
              Could not load filter options (API offline). Filters fall back to defaults.
            </p>
          ) : null}
        </aside>

        {/* Main panel */}
        <main className="flex-1 overflow-x-auto p-6">
          {/* Status header */}
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>
              <span className="font-semibold text-gray-900">{fmtInt(points.length)}</span> points
            </span>
            <span>
              <span className="font-semibold text-gray-900">{fmtInt(screened.screened)}</span>{' '}
              outliers screened
            </span>
            <span>
              <span className="font-semibold text-gray-900">{fmtInt(bitSizeCount)}</span> bit sizes
            </span>
            {dataQuery.data?.truncated ? (
              <span className="text-amber-600">results truncated</span>
            ) : null}
            {dataQuery.data?.note ? (
              <span className="text-gray-400">{dataQuery.data.note}</span>
            ) : null}
          </div>

          {applied === null ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
              Choose filters and press <span className="font-medium">Show</span> to load runs.
            </div>
          ) : dataQuery.isLoading ? (
            <div className="text-sm text-gray-500">Loading runs…</div>
          ) : dataQuery.isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Failed to load runs: {(dataQuery.error as Error).message}
            </div>
          ) : points.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
              No bit runs match these filters.
            </div>
          ) : (
            <>
              {view === 'summary' && <SummaryView points={points} />}
              {view === 'contour' && <ContourView points={points} />}
              {view === 'mse' && <MseView points={points} />}
              {view === 'hydraulics' && <HydraulicsView points={points} />}
              {view === 'economics' && <EconomicsView points={points} />}
              {view === 'scatter' && <ScatterView points={points} />}
              {view === 'bysize' && <BySizeView points={points} />}
              {view === 'table' && <TableView points={points} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
