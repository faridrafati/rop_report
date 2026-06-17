/**
 * TableView — every screened point in a sortable table. Click a column header to
 * sort; ROP defaults to descending so the fastest runs surface first. The dull
 * grade title is shown on row hover (title attribute).
 */
import { useMemo, useState } from 'react';
import type { RopPoint } from '../types';
import { fmt, fmtInt } from '../ui';

interface Props {
  points: RopPoint[];
}

type SortKey =
  | 'ropMhr'
  | 'wob'
  | 'rpm'
  | 'mse'
  | 'hsi'
  | 'bitSize'
  | 'iadc'
  | 'make'
  | 'reasonLabel'
  | 'depthIn';

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
  render: (p: RopPoint) => string;
}

const COLUMNS: Column[] = [
  { key: 'ropMhr', label: 'ROP (m/hr)', numeric: true, render: (p) => fmt(p.ropMhr, 1) },
  { key: 'wob', label: 'WOB (lbf)', numeric: true, render: (p) => fmtInt(p.wob) },
  { key: 'rpm', label: 'RPM', numeric: true, render: (p) => fmtInt(p.rpm) },
  { key: 'mse', label: 'MSE (psi)', numeric: true, render: (p) => fmtInt(p.mse) },
  { key: 'hsi', label: 'HSI', numeric: true, render: (p) => fmt(p.hsi, 2) },
  { key: 'bitSize', label: 'Bit size', numeric: false, render: (p) => p.bitSize ?? '—' },
  { key: 'iadc', label: 'IADC', numeric: false, render: (p) => p.iadc ?? '—' },
  { key: 'make', label: 'Make', numeric: false, render: (p) => p.make ?? '—' },
  {
    key: 'reasonLabel',
    label: 'Reason',
    numeric: false,
    render: (p) => p.reasonLabel ?? p.reasonCode ?? '—',
  },
  { key: 'depthIn', label: 'Depth in (m)', numeric: true, render: (p) => fmtInt(p.depthIn) },
];

function compare(a: RopPoint, b: RopPoint, key: SortKey, numeric: boolean): number {
  const va = a[key];
  const vb = b[key];
  if (numeric) {
    const na = typeof va === 'number' && Number.isFinite(va) ? va : -Infinity;
    const nb = typeof vb === 'number' && Number.isFinite(vb) ? vb : -Infinity;
    return na - nb;
  }
  return String(va ?? '').localeCompare(String(vb ?? ''));
}

export function TableView({ points }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('ropMhr');
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey)!;
    const arr = [...points].sort((a, b) => compare(a, b, sortKey, col.numeric));
    if (desc) arr.reverse();
    return arr;
  }, [points, sortKey, desc]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setDesc((d) => !d);
    } else {
      setSortKey(key);
      setDesc(true);
    }
  };

  if (!points.length) {
    return <div className="text-sm text-gray-500">No points to display.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-500">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`cursor-pointer select-none px-3 py-2 ${
                  c.numeric ? 'text-right' : ''
                }`}
                onClick={() => onSort(c.key)}
              >
                {c.label}
                {sortKey === c.key ? (desc ? ' ▼' : ' ▲') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.bitRunId}
              className="border-b border-gray-100 hover:bg-gray-50"
              title={p.dullTitle ?? undefined}
            >
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-1.5 ${
                    c.numeric ? 'text-right text-gray-700' : 'text-gray-900'
                  }`}
                >
                  {c.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
