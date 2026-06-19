/**
 * Office-Engineer "Import DDR" workspace.
 *
 * Upload a wellsite Daily Drilling Report PDF → Parse (preview the extracted
 * fields, no DB write) → Import (persist the DailyReport + activities + fluid +
 * bit run under the current tenant). Parse-then-import lets the engineer verify
 * the extraction before it lands in the database.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  importDdrPdf,
  parseDdrPdf,
  type ImportResult,
  type ParsedDdr,
} from './api';

function Field({ label, value }: { label: string; value: unknown }) {
  const display = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate text-sm text-slate-800" title={display}>{display}</dd>
    </div>
  );
}

function Preview({ ddr }: { ddr: ParsedDdr }) {
  return (
    <div className="space-y-5">
      {ddr.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Parser notes</p>
          <ul className="ml-4 list-disc">{ddr.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Report</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="DDR No" value={ddr.ddrNo} />
          <Field label="Date" value={ddr.reportDate} />
          <Field label="Well" value={ddr.wellName} />
          <Field label="Field" value={ddr.fieldName} />
          <Field label="Client (PDF)" value={ddr.client} />
          <Field label="Rig" value={ddr.rigNumber} />
          <Field label="Contractor" value={ddr.contractor} />
          <Field label="Well type" value={ddr.wellType} />
          <Field label="Start depth (m)" value={ddr.startDepthMd} />
          <Field label="End depth (m)" value={ddr.endDepthMd} />
          <Field label="Progress (m)" value={ddr.depthProgressM} />
          <Field label="Avg ROP (m/hr)" value={ddr.avgRopMhr} />
          <Field label="Drilling hrs" value={ddr.drillingHours} />
          <Field label="Geology" value={ddr.currentGeology} />
          <Field label="Head count" value={ddr.headCount} />
          <Field label="Hazards" value={ddr.hazards} />
        </dl>
        <div className="mt-3 space-y-1 text-sm">
          {ddr.operationsAtReportTime && <p><span className="text-slate-400">At report time: </span>{ddr.operationsAtReportTime}</p>}
          {ddr.operationsSummary && <p><span className="text-slate-400">Summary: </span>{ddr.operationsSummary}</p>}
          {ddr.operationsNextPeriod && <p><span className="text-slate-400">Next: </span>{ddr.operationsNextPeriod}</p>}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Activities ({ddr.activities.length})</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-3">Start</th>
                <th className="py-1.5 pr-3">Dur (hr)</th>
                <th className="py-1.5 pr-3">End</th>
                <th className="py-1.5 pr-3">Code</th>
                <th className="py-1.5 pr-3">NPT?</th>
                <th className="py-1.5">Description</th>
              </tr>
            </thead>
            <tbody>
              {ddr.activities.map((a, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="py-1.5 pr-3 tabular-nums">{a.startTime ?? '—'}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{a.durationHr ?? '—'}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{a.endTime ?? '—'}</td>
                  <td className="py-1.5 pr-3 font-medium">{a.code1 ?? '—'}</td>
                  <td className="py-1.5 pr-3">{a.isProductive ? '' : 'NPT'}</td>
                  <td className="py-1.5 text-slate-600">{a.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Mud / fluid</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Type" value={ddr.fluid?.type} />
            <Field label="Density (ppg)" value={ddr.fluid?.densityPpg} />
            <Field label="Funnel visc (s/qt)" value={ddr.fluid?.funnelVisc} />
            <Field label="pH" value={ddr.fluid?.ph} />
          </dl>
        </section>
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Bit run {ddr.parameters.length > 0 && <span className="font-normal text-slate-400">· {ddr.parameters.length} param intervals</span>}
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Size (in)" value={ddr.bit?.sizeIn} />
            <Field label="Model" value={ddr.bit?.model} />
            <Field label="IADC" value={ddr.bit?.iadc} />
            <Field label="Make" value={ddr.bit?.make} />
            <Field label="Serial" value={ddr.bit?.serial} />
            <Field label="Nozzles" value={ddr.bit?.nozzles} />
            <Field label="TFA (in²)" value={ddr.bit?.tfaIn2} />
            <Field label="Bit revs" value={ddr.bit?.bitRevs} />
          </dl>
        </section>
      </div>
    </div>
  );
}

export function ImportDdrTab() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedDdr | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'idle' | 'parsing' | 'importing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setFile(f);
    setParsed(null);
    setResult(null);
    setError(null);
  }

  async function onParse() {
    if (!file) return;
    setBusy('parsing');
    setError(null);
    setResult(null);
    try {
      setParsed(await parseDdrPdf(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed.');
    } finally {
      setBusy('idle');
    }
  }

  async function onImport() {
    if (!file) return;
    setBusy('importing');
    setError(null);
    try {
      const res = await importDdrPdf(file);
      setResult(res);
      setParsed(res.parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy('idle');
    }
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Import Daily Drilling Report (PDF)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a wellsite DDR PDF, review the extracted data, then import it as a daily report
          (status, activities, mud check) plus the bit run — scoped to your client.
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onParse} disabled={!file || busy !== 'idle'} className="btn btn-ghost px-4 py-1.5">
            {busy === 'parsing' ? 'Parsing…' : 'Parse / preview'}
          </button>
          <button type="button" onClick={onImport} disabled={!file || busy !== 'idle'} className="btn btn-primary px-4 py-1.5">
            {busy === 'importing' ? 'Importing…' : 'Import to database'}
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Imported successfully.</p>
          <p className="mt-1">
            Created {result.created.activities} activities, {result.created.fluids} fluid check
            {result.created.fluids === 1 ? '' : 's'}
            {result.created.bitRun ? ' and 1 bit run' : ''}
            {result.created.well ? ' (new well created)' : ''}.
          </p>
          <p className="mt-1">
            <Link to="/capture" className="font-medium underline">View in Capture →</Link>
          </p>
        </div>
      )}

      {parsed && <Preview ddr={parsed} />}
    </main>
  );
}
