/**
 * Client for the capture API (bit runs + daily reports). Uses the shared auth
 * header; relative paths go through the Vite dev proxy (/api → :3000).
 */
import type { CreateBitRunInput, CreateDailyReportInput } from '@drilliq/shared';
import { authHeader, saveAuth } from '../../auth/auth';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) saveAuth(null);
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
  }
  return (await res.json()) as T;
}

function get<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { headers: { ...authHeader() } }).then(asJson<T>);
}
function post<T>(path: string, body: unknown): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  }).then(asJson<T>);
}

export interface CaptureRefs {
  wellbores: { id: string; name: string; well: { name: string } | null }[];
  sections: { id: string; seq: number; wellboreId: string; holeSize: { label: string } | null }[];
  bitMasters: { id: string; manufacturer: string | null; typeBit: string | null; diaBit: string | null; codeIadc: string | null }[];
  reasonsPulled: { id: string; code: string; description: string }[];
  activityTypes: { id: string; code: string; name: string }[];
  mudTypes: { id: string; name: string }[];
}

export interface BitRunRow {
  id: string;
  numBit: number | null;
  depthIn: string | null;
  depthOut: string | null;
  footage: string | null;
  rop: string | null;
  bitClass: string | null;
  condFinalInner: number | null;
  condFinalOuter: number | null;
  condFinalDullChar: string | null;
  condFinalReason: string | null;
  stickSlip: boolean | null;
  whirl: boolean | null;
  bitBounce: boolean | null;
  bitBalling: boolean | null;
  createdAt: string;
  bitMaster?: { manufacturer: string | null; typeBit: string | null } | null;
}

export interface DailyReportRow {
  id: string;
  reportDate: string;
  reportNo: number | null;
  statusInfo: string | null;
  _count?: { activities: number; fluids: number };
}

export const fetchRefs = () => get<CaptureRefs>('/api/capture/refs');
export const fetchBitRuns = () => get<BitRunRow[]>('/api/bit-runs');
export const createBitRun = (input: CreateBitRunInput) => post<BitRunRow>('/api/bit-runs', input);
export const fetchDailyReports = () => get<DailyReportRow[]>('/api/daily-reports');
export const createDailyReport = (input: CreateDailyReportInput) =>
  post<{ id: string }>('/api/daily-reports', input);
