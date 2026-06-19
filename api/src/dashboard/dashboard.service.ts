import { Injectable } from '@nestjs/common';
import { founderCurve, type RopPoint } from '@drilliq/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RopService } from '../rop/rop.service';

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

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
  /** cost/m + ROP by bit make (the bit leaderboard). */
  bitLeaderboard: { make: string; runs: number; avgCostPerMeter: number | null; avgRopFtHr: number | null; avgMse: number | null }[];
  /** footage rolled up per well. */
  footageByWell: { well: string; footageM: number; runs: number }[];
}

/**
 * Management dashboard KPIs. Reuses RopService (the same MSE/HSI/cost formulas as
 * the ROP-optimization tab — no recomputation drift) for bit-run metrics, and
 * adds NPT% from the daily-report activity stream. Everything is RLS-scoped.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly rop: RopService,
    private readonly prisma: PrismaService,
  ) {}

  async kpis(): Promise<DashboardKpis> {
    const { points } = await this.rop.getRopOptimization({});

    const costs = points.map((p) => p.costPerMeter).filter((x): x is number => x != null);
    const rops = points.map((p) => p.ropFthr).filter((x): x is number => x != null);
    const mses = points.map((p) => p.mse).filter((x): x is number => x != null);

    // Bit leaderboard by make.
    const byMake = new Map<string, RopPoint[]>();
    for (const p of points) {
      const k = p.make ?? '(unknown)';
      (byMake.get(k) ?? byMake.set(k, []).get(k)!).push(p);
    }
    const bitLeaderboard = [...byMake.entries()]
      .map(([make, ps]) => ({
        make,
        runs: ps.length,
        avgCostPerMeter: avg(ps.map((p) => p.costPerMeter).filter((x): x is number => x != null)),
        avgRopFtHr: avg(ps.map((p) => p.ropFthr).filter((x): x is number => x != null)),
        avgMse: avg(ps.map((p) => p.mse).filter((x): x is number => x != null)),
      }))
      .sort((a, b) => (a.avgCostPerMeter ?? Infinity) - (b.avgCostPerMeter ?? Infinity));

    // Footage by well.
    const byWell = new Map<string, { footageM: number; runs: number }>();
    for (const p of points) {
      const e = byWell.get(p.wellName) ?? { footageM: 0, runs: 0 };
      e.footageM += p.meters ?? 0;
      e.runs += 1;
      byWell.set(p.wellName, e);
    }
    const footageByWell = [...byWell.entries()]
      .map(([well, e]) => ({ well, footageM: Math.round(e.footageM * 100) / 100, runs: e.runs }))
      .sort((a, b) => b.footageM - a.footageM);

    // Founder rate: fraction of wells whose WOB-vs-ROP curve flags a founder point.
    const wellPoints = new Map<string, { wob: number; rop: number }[]>();
    for (const p of points) {
      if (p.wob != null && p.ropFthr != null) {
        (wellPoints.get(p.wellName) ?? wellPoints.set(p.wellName, []).get(p.wellName)!).push({ wob: p.wob, rop: p.ropFthr });
      }
    }
    let wellsAssessed = 0;
    let wellsFoundered = 0;
    for (const pts of wellPoints.values()) {
      if (pts.length < 3) continue;
      wellsAssessed += 1;
      if (founderCurve(pts).founderWob != null) wellsFoundered += 1;
    }

    // NPT% from DDR activities (RLS-scoped).
    const activities = await this.prisma.tenant((db) =>
      db.activity.findMany({ select: { durationHr: true, isProductive: true, classification: true } }),
    );
    let productiveHours = 0;
    let nptHours = 0;
    for (const a of activities) {
      const hr = a.durationHr ? Number(a.durationHr) : 0;
      const npt = !a.isProductive && (a.classification === 'UNPLANNED' || a.classification === 'DOWNTIME');
      if (npt) nptHours += hr;
      else productiveHours += hr;
    }
    const totalHours = productiveHours + nptHours;

    return {
      bitRunCount: points.length,
      costPerMeterAvg: avg(costs),
      ropFtHrAvg: avg(rops),
      mseAvg: avg(mses),
      founderRate: wellsAssessed ? wellsFoundered / wellsAssessed : null,
      nptPercent: totalHours > 0 ? (nptHours / totalHours) * 100 : null,
      productiveHours: Math.round(productiveHours * 100) / 100,
      nptHours: Math.round(nptHours * 100) / 100,
      totalFootageM: Math.round(footageByWell.reduce((s, w) => s + w.footageM, 0) * 100) / 100,
      bitLeaderboard,
      footageByWell,
    };
  }
}
