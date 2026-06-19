/**
 * Parser for the wellsite Daily Drilling Report (DDR) PDF template (the
 * WellView-style report used on the South Pars rigs, e.g.
 * "Daily Drilling Report 31, SPD20-14, P-200 Rig").
 *
 * Input is the layout-preserved text from {@link pdfToLayoutText}. The parser is
 * a PURE function (no I/O) so it is unit-testable against the example report.
 * It extracts the header metadata, the narrative sections, the 24-hr activity
 * log, the mud check and the bit run. Tabular blocks are read with a
 * column-slicing helper keyed on the (fixed) header labels.
 */

export interface ParsedActivity {
  startTime: string | null; // "HH:MM"
  endTime: string | null; // "HH:MM"
  durationHr: number | null;
  code1: string | null;
  code2: string | null;
  description: string;
  isProductive: boolean;
}

export interface ParsedFluid {
  checkDepthMd: number | null;
  type: string | null;
  densityPpg: number | null;
  funnelVisc: number | null;
  ph: number | null;
}

export interface ParsedBit {
  sizeIn: number | null;
  model: string | null;
  iadc: string | null;
  make: string | null;
  serial: string | null;
  nozzles: string | null;
  tfaIn2: number | null;
  bitRevs: number | null;
  depthInMd: number | null;
}

export interface ParsedParameter {
  startMd: number | null;
  endMd: number | null;
  drillTimeHr: number | null;
  intRopMhr: number | null;
  torque: number | null;
  rpm: number | null;
  flowGpm: number | null;
  sppPsi: number | null;
  wobKlbf: number | null;
}

export interface ParsedDdr {
  ddrNo: number | null;
  reportDate: string | null; // ISO YYYY-MM-DD
  wellName: string | null;
  fieldName: string | null;
  client: string | null;
  wellType: string | null;
  rigNumber: string | null;
  contractor: string | null;
  spudDate: string | null; // ISO
  waterDepthM: number | null;
  kbElevationM: number | null;
  opsCategory: string | null;
  currentGeology: string | null;
  mudType: string | null;
  lastMudDensityPpg: number | null;
  headCount: number | null;
  hazards: string | null;
  startDepthMd: number | null;
  endDepthMd: number | null;
  depthProgressM: number | null;
  drillingHours: number | null;
  avgRopMhr: number | null;
  operationsAtReportTime: string | null;
  operationsSummary: string | null;
  operationsNextPeriod: string | null;
  generalNotes: string | null;
  activities: ParsedActivity[];
  fluid: ParsedFluid | null;
  bit: ParsedBit | null;
  parameters: ParsedParameter[];
  warnings: string[];
}

// ── small parsing helpers ────────────────────────────────────────
function toNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** "5/26/2026" (M/D/Y) → "2026-05-26". Returns null if not a date. */
function toIsoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function clean(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

/**
 * Read an aligned label/value table: locate the header line, take the next
 * non-empty line as the value row, then slice the value row at each label's
 * column position. Returns label → trimmed value.
 */
function colSlice(
  lines: string[],
  headerTest: (l: string) => boolean,
  labels: string[],
): Record<string, string> {
  const idx = lines.findIndex(headerTest);
  if (idx < 0) return {};
  const header = lines[idx];
  let value = '';
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].trim()) { value = lines[i]; break; }
  }
  const positions = labels
    .map((lab) => ({ lab, start: header.indexOf(lab) }))
    .filter((p) => p.start >= 0)
    .sort((a, b) => a.start - b.start);
  const res: Record<string, string> = {};
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : value.length;
    res[positions[i].lab] = value.slice(start, end).trim();
  }
  return res;
}

/** Join the lines strictly between two section headers into one trimmed block. */
function sectionText(lines: string[], startRe: RegExp, endRe: RegExp): string | null {
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return null;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (endRe.test(lines[i])) break;
    if (lines[i].trim()) out.push(lines[i].trim());
  }
  return out.length ? out.join(' ').replace(/\s+/g, ' ').trim() : null;
}

const ACTIVITY_ROW =
  /^\s*(\d{1,2}:\d{2})\s+([\d.]+)\s+(\d{1,2}:\d{2})\s+(\S+)\s+(\S+)\s+(.*)$/;

/** Activity codes that denote non-productive time (waiting / repair / downtime). */
const NPT_HINT = /^(W|WOW|WOM|REP|RIG|NPT|WT)/i;

export function parseDdr(text: string): ParsedDdr {
  const rawLines = text.split('\n');
  const lines = rawLines.map((l) => l.replace(/\s+$/, ''));
  const flat = lines.join('\n');
  const warnings: string[] = [];

  // ── scalar header fields ──────────────────────────────────────
  const ddrNo = toNum((flat.match(/DDR No:\s*([\d.]+)/) ?? [])[1]);
  const reportDate = toIsoDate((flat.match(/DDR Date:\s*([\d/]+)/) ?? [])[1]);

  // Well name: the centred single-token line near the top (e.g. "SPD20-14").
  let wellName: string | null = null;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const t = lines[i].trim();
    if (/^[A-Z]{2,}[\d-][\w/-]*$/.test(t) && t.length >= 4 && t.length <= 24) {
      wellName = t;
      break;
    }
  }

  const block1 = colSlice(
    lines,
    (l) => l.includes('Field Name') && l.includes('Client') && l.includes('Well Type'),
    ['Field Name', 'Client', 'Well Type', 'Water Depth (m)', 'Latitude', 'Longitude'],
  );
  const block2 = colSlice(
    lines,
    (l) => l.includes('Rig Number') && l.includes('Contractor'),
    ['Rig Number', 'Contractor', 'Original KB Elevation', 'Other Elevation Note', 'Comment'],
  );
  const block3 = colSlice(
    lines,
    (l) => l.includes('Spud Date') && l.includes('Kick Off Depth'),
    ['Spud Date', 'Cum Time Log Days', 'Days LTI', 'Kick Off Depth', 'Last Casing String'],
  );
  const block4 = colSlice(
    lines,
    (l) => l.includes('Ops Category') && l.includes('Mud Type'),
    ['Ops Category', 'Current Geology', 'Mud Type', 'Last Mud Check Density', 'Head Count', 'Hazards'],
  );
  const block5 = colSlice(
    lines,
    (l) => l.includes('Start Depth') && l.includes('End Depth') && l.includes('Depth Progress'),
    ['Start Depth (mKB)', 'End Depth (mKB)', 'End Depth (TVD)', 'Depth Progress (m)', 'Drilling Hours (hr)', 'Avg ROP (m/hr)'],
  );

  // ── narrative sections ────────────────────────────────────────
  const operationsAtReportTime = sectionText(
    lines, /Operations at Report Time/, /Operations Summary/,
  );
  const operationsSummary = sectionText(
    lines, /Operations Summary/, /Operations Next Report Period/,
  );
  const operationsNextPeriod = sectionText(
    lines, /Operations Next Report Period/, /Supervisors Contact/,
  );
  const generalNotes = sectionText(
    lines, /^\s*General Notes\b/, /Page \(/,
  );

  // ── 24-hr activity log ────────────────────────────────────────
  const activities: ParsedActivity[] = [];
  {
    const start = lines.findIndex((l) => /24 Hrs Operation Report/.test(l));
    const end = lines.findIndex((l, i) => i > start && /6 Hrs Morning Report/.test(l));
    if (start >= 0) {
      const last = end > start ? end : lines.length;
      for (let i = start + 1; i < last; i++) {
        const m = lines[i].match(ACTIVITY_ROW);
        if (m) {
          const [, st, dur, et, c1, c2, com] = m;
          activities.push({
            startTime: st,
            durationHr: toNum(dur),
            endTime: et,
            code1: c1,
            code2: c2,
            description: com.trim(),
            isProductive: !NPT_HINT.test(c1),
          });
        } else if (activities.length && lines[i].trim() && !/Code 1|Code 2|Com\b|Start|End Time/.test(lines[i])) {
          // continuation of the previous activity's comment
          activities[activities.length - 1].description += ' ' + lines[i].trim();
        }
      }
    }
  }
  if (activities.length === 0) warnings.push('No activity rows parsed from the 24-hr operation report.');

  // ── mud / fluid ───────────────────────────────────────────────
  const lastMudDensityPpg = toNum(block4['Last Mud Check Density']);
  let fluid: ParsedFluid | null = null;
  {
    const mudBlock = colSlice(
      lines,
      (l) => l.includes('Density (lb/gal)') && l.includes('Funnel Viscosity'),
      ['Depth (mKB)', 'Type', 'Density (lb/gal)', 'T Flowline', 'Funnel Viscosity', 'PV Calc', 'YP Calc', 'Filtrate'],
    );
    const phBlock = colSlice(
      lines,
      (l) => l.includes('MBT (lb/bbl)') && l.includes('Chlorides'),
      ['MBT (lb/bbl)', 'pH', 'Chlorides', 'Hardness Ca', 'KCl', 'Mud Lost', 'Active Mud', 'Vol Mud Res'],
    );
    const density = toNum(mudBlock['Density (lb/gal)']) ?? lastMudDensityPpg;
    fluid = {
      checkDepthMd: toNum(mudBlock['Depth (mKB)']) ?? toNum(block5['End Depth (mKB)']),
      type: clean(block4['Mud Type']),
      densityPpg: density,
      funnelVisc: toNum(mudBlock['Funnel Viscosity']),
      ph: toNum(phBlock['pH']),
    };
  }

  // ── bit run ───────────────────────────────────────────────────
  let bit: ParsedBit | null = null;
  {
    // identity row sits under "Size (in) Model IADC Codes Make Serial Number"
    const idCols = colSlice(
      lines,
      (l) => l.includes('Size (in)') && l.includes('Model') && l.includes('Serial Number'),
      ['Size (in)', 'Model', 'IADC Codes', 'Make', 'Serial Number'],
    );
    // nozzles / TFA / revs row: e.g. "RR#1  22/22/22/22  1.48  153,577.80"
    const nozLine = lines.find(
      (l) => /\d{1,2}\/\d{1,2}\/\d{1,2}\/\d{1,2}/.test(l) && /\d+\.\d+/.test(l),
    );
    const nozm = nozLine?.match(/(\d{1,2}(?:\/\d{1,2}){1,7})\s+([\d.]+)\s+([\d,]+(?:\.\d+)?)/);
    const depthIn = toNum((flat.match(/Depth In \(mKB\)[\s\S]{0,200}?(\d{2,5}\.\d{2})/) ?? [])[1]);
    const model = clean(idCols['Model']);
    if (model || nozm) {
      bit = {
        sizeIn: toNum(idCols['Size (in)']),
        model,
        iadc: clean(idCols['IADC Codes']),
        make: clean(idCols['Make']),
        serial: clean(idCols['Serial Number']),
        nozzles: nozm ? nozm[1] : null,
        tfaIn2: nozm ? toNum(nozm[2]) : null,
        bitRevs: nozm ? toNum(nozm[3]) : null,
        depthInMd: depthIn,
      };
    } else {
      warnings.push('Bit run not detected.');
    }
  }

  // ── drilling parameters table ─────────────────────────────────
  const parameters: ParsedParameter[] = [];
  {
    const start = lines.findIndex((l) => /^\s*Drilling Parameters\s*$/.test(l));
    const end = lines.findIndex((l, i) => i > start && /Mud Information/.test(l));
    if (start >= 0) {
      const last = end > start ? end : lines.length;
      // rows: Start End DrillTime Slide Circ IntROP Tq RPM Flow SPP WOB (numbers)
      const rowRe =
        /^\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d,]+)\s+([\d,]+\.\d)\s+([\d.]+)\s*$/;
      for (let i = start + 1; i < last; i++) {
        const m = lines[i].match(rowRe);
        if (m) {
          parameters.push({
            startMd: toNum(m[1]),
            endMd: toNum(m[2]),
            drillTimeHr: toNum(m[3]),
            intRopMhr: toNum(m[6]),
            torque: toNum(m[7]),
            rpm: toNum(m[8]),
            flowGpm: toNum(m[9]),
            sppPsi: toNum(m[10]),
            wobKlbf: toNum(m[11]),
          });
        }
      }
    }
  }

  return {
    ddrNo,
    reportDate,
    wellName,
    fieldName: clean(block1['Field Name']),
    client: clean(block1['Client']),
    wellType: clean(block1['Well Type']),
    rigNumber: clean(block2['Rig Number']),
    contractor: clean(block2['Contractor']),
    spudDate: toIsoDate(block3['Spud Date']),
    waterDepthM: toNum(block1['Water Depth (m)']),
    kbElevationM: toNum(block2['Original KB Elevation']),
    opsCategory: clean(block4['Ops Category']),
    currentGeology: clean(block4['Current Geology']),
    mudType: clean(block4['Mud Type']),
    lastMudDensityPpg,
    headCount: toNum(block4['Head Count']) != null ? Math.round(toNum(block4['Head Count'])!) : null,
    hazards: clean(block4['Hazards']),
    startDepthMd: toNum(block5['Start Depth (mKB)']),
    endDepthMd: toNum(block5['End Depth (mKB)']),
    depthProgressM: toNum(block5['Depth Progress (m)']),
    drillingHours: toNum(block5['Drilling Hours (hr)']),
    avgRopMhr: toNum(block5['Avg ROP (m/hr)']),
    operationsAtReportTime,
    operationsSummary,
    operationsNextPeriod,
    generalNotes,
    activities,
    fluid,
    bit,
    parameters,
    warnings,
  };
}
