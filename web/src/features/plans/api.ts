import type { CreatePlanInput, CreateRecommendationInput } from '@drilliq/shared';
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
const get = <T>(p: string) => fetch(`${BASE}${p}`, { headers: { ...authHeader() } }).then(asJson<T>);
const post = <T>(p: string, body?: unknown) =>
  fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(asJson<T>);

export interface PlanRow {
  id: string; title: string; kind: string; status: string;
  well?: { name: string } | null; _count?: { recommendations: number };
}
export interface Recommendation {
  id: string; targetWob: string | null; targetRpm: string | null; targetFlow: string | null;
  rationale: string | null; bitMaster?: { manufacturer: string | null; typeBit: string | null } | null;
}
export interface Approval { id: string; status: string; comment: string | null; decidedAt: string | null; }
export interface PlanDetail extends PlanRow { recommendations: Recommendation[]; approvals: Approval[]; }

export const fetchPlans = () => get<PlanRow[]>('/api/plans');
export const fetchPlan = (id: string) => get<PlanDetail>(`/api/plans/${id}`);
export const createPlan = (input: CreatePlanInput) => post<PlanRow>('/api/plans', input);
export const addRecommendation = (id: string, input: CreateRecommendationInput) =>
  post<Recommendation>(`/api/plans/${id}/recommendations`, input);
export const submitPlan = (id: string) => post<PlanRow>(`/api/plans/${id}/submit`);
export const approvePlan = (id: string, comment?: string) => post<PlanRow>(`/api/plans/${id}/approve`, { comment });
export const rejectPlan = (id: string, comment?: string) => post<PlanRow>(`/api/plans/${id}/reject`, { comment });
