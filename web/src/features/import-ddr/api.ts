import { authHeader, saveAuth } from '../../auth/auth';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export interface ParsedActivity {
  startTime: string | null;
  endTime: string | null;
  durationHr: number | null;
  code1: string | null;
  code2: string | null;
  description: string;
  isProductive: boolean;
}
export interface ParsedDdr {
  ddrNo: number | null;
  reportDate: string | null;
  wellName: string | null;
  fieldName: string | null;
  client: string | null;
  wellType: string | null;
  rigNumber: string | null;
  contractor: string | null;
  spudDate: string | null;
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
  fluid: {
    checkDepthMd: number | null;
    type: string | null;
    densityPpg: number | null;
    funnelVisc: number | null;
    ph: number | null;
  } | null;
  bit: {
    sizeIn: number | null;
    model: string | null;
    iadc: string | null;
    make: string | null;
    serial: string | null;
    nozzles: string | null;
    tfaIn2: number | null;
    bitRevs: number | null;
    depthInMd: number | null;
  } | null;
  parameters: unknown[];
  warnings: string[];
}

export interface ImportResult {
  reportId: string;
  wellId: string;
  wellboreId: string;
  bitRunId: string | null;
  created: { activities: number; fluids: number; bitRun: boolean; well: boolean; wellbore: boolean };
  parsed: ParsedDdr;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) saveAuth(null);
    const body = await res.text().catch(() => '');
    let msg = body;
    try {
      const j = JSON.parse(body);
      msg = j.message ?? body;
    } catch {
      /* keep raw text */
    }
    throw new Error(`${res.status} — ${msg || res.statusText}`);
  }
  return (await res.json()) as T;
}

function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  // NB: do NOT set Content-Type — the browser adds the multipart boundary.
  return fetch(`${BASE}${path}`, { method: 'POST', headers: { ...authHeader() }, body: form }).then(asJson<T>);
}

export const parseDdrPdf = (file: File) => upload<ParsedDdr>('/api/ddr-import/parse', file);
export const importDdrPdf = (file: File) => upload<ImportResult>('/api/ddr-import', file);
