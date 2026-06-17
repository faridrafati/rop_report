/**
 * Client for the ROP-optimization API. Standalone to DrillIQ.
 *
 * Uses VITE_API_BASE_URL when set (e.g. http://localhost:3000); otherwise falls
 * back to a same-origin relative path so the Vite dev proxy (/api → :3000) works.
 */
import type { RopData, RopOptimizationFilters, RopOptions } from './types';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const url = (path: string): string => `${BASE}${path}`;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Request failed: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`,
    );
  }
  return (await res.json()) as T;
}

/** POST /api/rop-optimization — operating points for the given filters. */
export async function fetchRopOptimization(
  filters: RopOptimizationFilters,
): Promise<RopData> {
  const res = await fetch(url('/api/rop-optimization'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
  });
  return asJson<RopData>(res);
}

/** GET /api/rop-optimization/options — distinct filter option lists. */
export async function fetchRopOptions(): Promise<RopOptions> {
  const res = await fetch(url('/api/rop-optimization/options'));
  return asJson<RopOptions>(res);
}
