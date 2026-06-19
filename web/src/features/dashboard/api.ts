import { authHeader, saveAuth } from '../../auth/auth';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) saveAuth(null);
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface DashboardKpis {
  bitRunCount: number;
  costPerMeterAvg: number | null;
  ropFtHrAvg: number | null;
  mseAvg: number | null;
  founderRate: number | null;
  nptPercent: number | null;
  productiveHours: number;
  nptHours: number;
  totalFootageM: number;
  bitLeaderboard: { make: string; runs: number; avgCostPerMeter: number | null; avgRopFtHr: number | null; avgMse: number | null }[];
  footageByWell: { well: string; footageM: number; runs: number }[];
}

export const fetchKpis = () =>
  fetch(`${BASE}/api/dashboard/kpis`, { headers: { ...authHeader() } }).then(asJson<DashboardKpis>);
