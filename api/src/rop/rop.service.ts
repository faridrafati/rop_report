import { Injectable } from '@nestjs/common';
import { BitFamily, Prisma } from '@prisma/client';
import {
  bitClass,
  costPerMeter,
  estimateTorque,
  hsiFromHydraulics,
  mhrToFthr,
  mse,
  MU_DEFAULT,
  parseBitSizeInches,
  rigUsdPerHr,
  type BitClass,
  type RopData,
  type RopOptimizationFilters,
  type RopPoint,
} from '@drilliq/shared';

import { PrismaService } from '../prisma/prisma.service';

/** Hard cap on returned points; beyond this the response is flagged truncated. */
const MAX_POINTS = 20000;

/** Default rig day rate (USD/day) when no rig.dayRate is available, for cost/m. */
const DEFAULT_RIG_DAY_RATE_USD = 24000;

/** Decimal | number | null → number | null. */
function num(
  v: Prisma.Decimal | number | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : v.toNumber();
  return Number.isFinite(n) ? n : null;
}

/**
 * Compose a final IADC dull-grade title from the eight condFinal* positions,
 * e.g. "1-2-WT-A-X-I-NO-PR". Returns null when nothing was graded.
 */
function dullTitle(row: {
  condFinalInner: number | null;
  condFinalOuter: number | null;
  condFinalDullChar: string | null;
  condFinalLocation: string | null;
  condFinalBearing: string | null;
  condFinalGauge: string | null;
  condFinalOther: string | null;
  condFinalReason: string | null;
}): string | null {
  const parts = [
    row.condFinalInner,
    row.condFinalOuter,
    row.condFinalDullChar,
    row.condFinalLocation,
    row.condFinalBearing,
    row.condFinalGauge,
    row.condFinalOther,
    row.condFinalReason,
  ].map((p) => {
    if (p === null || p === undefined) return null;
    const s = String(p).trim();
    return s.length ? s : null;
  });
  if (parts.every((p) => p === null)) return null;
  return parts.map((p) => p ?? '·').join('-');
}

@Injectable()
export class RopService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the ROP-optimization dataset: every qualifying bit run mapped to a
   * RopPoint (the @drilliq/shared contract), with MSE/HSI/cost derived from the
   * shared formulas. Depths are METERS; imperial formulas get converted inputs.
   */
  async getRopOptimization(
    filters: RopOptimizationFilters,
  ): Promise<RopData> {
    const where: Prisma.BitRunWhereInput = {};
    const and: Prisma.BitRunWhereInput[] = [];

    if (filters.wellIds?.length) {
      and.push({ wellbore: { wellId: { in: filters.wellIds } } });
    }
    if (filters.holeSizes?.length) {
      and.push({
        wellSection: { holeSize: { label: { in: filters.holeSizes } } },
      });
    }
    if (filters.bitFamilies?.length) {
      and.push({
        bitMaster: {
          bitFamily: { in: filters.bitFamilies as BitFamily[] },
        },
      });
    }
    if (filters.depthFrom !== undefined || filters.depthTo !== undefined) {
      const depthIn: Prisma.DecimalFilter = {};
      if (filters.depthFrom !== undefined) depthIn.gte = filters.depthFrom;
      if (filters.depthTo !== undefined) depthIn.lte = filters.depthTo;
      and.push({ depthIn });
    }
    if (filters.dateFrom || filters.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) createdAt.lte = new Date(filters.dateTo);
      and.push({ createdAt });
    }
    if (and.length) where.AND = and;

    // RLS-scoped: runs inside a tx with SET LOCAL app.current_client_id so the
    // database returns only the caller's tenant rows.
    const rows = await this.prisma.tenant((db) =>
      db.bitRun.findMany({
        where,
        include: {
          bitMaster: true,
          wellbore: { include: { well: true } },
          wellSection: { include: { holeSize: true } },
          reasonPulled: true,
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_POINTS + 1,
      }),
    );

    const truncated = rows.length > MAX_POINTS;
    const used = truncated ? rows.slice(0, MAX_POINTS) : rows;

    const points: RopPoint[] = [];
    for (const row of used) {
      const point = this.toPoint(row);
      if (point) points.push(point);
    }

    // Distinct bit sizes, sorted widest → narrowest by parsed inches.
    const sizeSet = new Set<string>();
    for (const p of points) if (p.bitSize) sizeSet.add(p.bitSize);
    const bitSizes = [...sizeSet].sort((a, b) => {
      const ia = parseBitSizeInches(a) ?? -Infinity;
      const ib = parseBitSizeInches(b) ?? -Infinity;
      return ib - ia;
    });

    return {
      points,
      bitSizes,
      total: points.length,
      truncated,
      note: truncated
        ? `Result truncated to ${MAX_POINTS} points.`
        : undefined,
    };
  }

  /**
   * Map one included BitRun row to a RopPoint, or null when it fails the
   * essential-parameter / sanity guards.
   */
  private toPoint(
    row: Prisma.BitRunGetPayload<{
      include: {
        bitMaster: true;
        wellbore: { include: { well: true } };
        wellSection: { include: { holeSize: true } };
        reasonPulled: true;
      };
    }>,
  ): RopPoint | null {
    const bm = row.bitMaster;
    const well = row.wellbore.well;

    const wob = num(row.wob);
    const rpm = num(row.rpm);
    const torque = num(row.torque);
    const flow = num(row.flowRate);
    const mwPpg = num(row.mudWeight);
    const diaIn = num(bm.diaBit);

    const footageM = num(row.footage);
    const bitHour = num(row.rotatingHours);

    // ROP: stored m/hr; derive from footage/hours when absent.
    let ropMhr = num(row.rop);
    if (ropMhr === null && footageM !== null && bitHour && bitHour > 0) {
      ropMhr = footageM / bitHour;
    }
    const ropFthr = ropMhr === null ? null : mhrToFthr(ropMhr);

    // ── Essential-parameter + sanity guard ──
    // Require the three essentials; reject obviously-bad WOB (>200 klbf = 200000 lbf).
    if (wob === null || rpm === null || ropMhr === null) return null;
    if (wob <= 0 || wob > 200000) return null;
    if (rpm <= 0 || rpm > 1000) return null;
    if (ropMhr <= 0) return null;

    const klass: BitClass = bitClass({
      iadc: bm.codeIadc,
      type: bm.typeBit,
      diamond: bm.bitFamily === BitFamily.DIAMOND,
    });

    // ── MSE (psi) — imperial inputs; ROP in ft/hr ──
    let mseVal: number | null = null;
    let mseEstimated = false;
    if (diaIn !== null && ropFthr !== null && ropFthr > 0) {
      let torqueForMse = torque;
      if (torqueForMse === null) {
        torqueForMse = estimateTorque({
          mu: MU_DEFAULT[klass],
          diaBitIn: diaIn,
          wobLbf: wob,
        });
        mseEstimated = true;
      }
      mseVal = mse(wob, rpm, torqueForMse, ropFthr, diaIn);
    }

    // ── HSI ──
    let hsiVal: number | null = null;
    let hsiSource: RopPoint['hsiSource'] = null;
    const reportedHsi = num(row.hsi);
    const tfa = num(bm.tfa);
    if (reportedHsi !== null) {
      hsiVal = reportedHsi;
      hsiSource = 'reported';
    } else if (
      mwPpg !== null &&
      flow !== null &&
      flow > 0 &&
      tfa !== null &&
      tfa > 0 &&
      diaIn !== null &&
      diaIn > 0
    ) {
      hsiVal = hsiFromHydraulics(mwPpg, flow, tfa, diaIn);
      hsiSource = 'computed';
    }

    // ── Cost per meter ──
    let costM: number | null = null;
    const bitUsd = num(bm.bitCost);
    const tripHr = num(row.tripHours);
    if (
      bitUsd !== null &&
      footageM !== null &&
      footageM > 0 &&
      bitHour !== null
    ) {
      costM = costPerMeter({
        bitUsd,
        rigUsdPerHr: rigUsdPerHr(DEFAULT_RIG_DAY_RATE_USD),
        drillHr: bitHour,
        tripHr: tripHr ?? 0,
        meterageM: footageM,
      });
    }

    return {
      bitRunId: row.id,
      wellId: well.id,
      wellName: well.name,
      wellboreId: row.wellboreId,
      wob,
      rpm,
      torque,
      ropMhr,
      ropFthr,
      flow,
      mwPpg,
      mse: mseVal,
      mseEstimated,
      hsi: hsiVal,
      hsiSource,
      costPerMeter: costM,
      diaIn,
      bitSize: row.wellSection?.holeSize?.label ?? null,
      bitClass: klass,
      iadc: bm.codeIadc ?? null,
      make: bm.manufacturer ?? null,
      depthIn: num(row.depthIn),
      depthOut: num(row.depthOut),
      meters: footageM,
      bitHour,
      reasonCode: row.reasonPulled?.code ?? null,
      reasonLabel: row.reasonPulled?.description ?? null,
      topFormation: null,
      dullTitle: dullTitle(row),
    };
  }

  /**
   * Distinct facet values for the sidebar filters: wells, hole-size labels,
   * bit families, and mud types — all within the caller's (RLS) tenant scope.
   */
  async getOptions(): Promise<{
    wells: { id: string; name: string }[];
    holeSizes: string[];
    bitFamilies: string[];
    mudTypes: { id: string; name: string }[];
  }> {
    // One RLS-scoped transaction: well/bitMaster are tenant-scoped; holeSize and
    // mudType are global lookups (RLS-exempt) but reading them here is harmless.
    const { wells, holeSizes, bitFamilyRows, mudTypes } =
      await this.prisma.tenant(async (db) => ({
        wells: await db.well.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        holeSizes: await db.holeSize.findMany({
          select: { label: true },
          orderBy: { label: 'asc' },
        }),
        bitFamilyRows: await db.bitMaster.findMany({
          select: { bitFamily: true },
          distinct: ['bitFamily'],
        }),
        mudTypes: await db.mudType.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      }));

    const holeLabels = [...new Set(holeSizes.map((h) => h.label))].sort(
      (a, b) =>
        (parseBitSizeInches(b) ?? -Infinity) -
        (parseBitSizeInches(a) ?? -Infinity),
    );

    return {
      wells,
      holeSizes: holeLabels,
      bitFamilies: bitFamilyRows.map((r) => r.bitFamily),
      mudTypes,
    };
  }
}
