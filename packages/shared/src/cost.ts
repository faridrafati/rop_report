/**
 * Drilling economics for the ROP-optimization Economics/Advisor views.
 * Metric-first (cost per METER, meterage in m) to match DrillIQ's SI storage.
 * Standalone — DrillIQ owns this code.
 */

export const HANDLING_HR_DEFAULT = 2;

/** Rig cost $/hr from a daily rate. */
export const rigUsdPerHr = (usdPerDay: number): number => usdPerDay / 24;

/**
 * Round-trip time (hr) for a bit at depth.
 *   tripHr = 2·depth / tripSpeed + handling
 */
export function tripHours(args: {
  depthM: number;
  tripSpeedMHr: number;
  handlingHr?: number;
}): number {
  const handling = args.handlingHr ?? HANDLING_HR_DEFAULT;
  if (args.tripSpeedMHr <= 0) return handling;
  return (2 * args.depthM) / args.tripSpeedMHr + handling;
}

/**
 * Cost per meter (metric analogue of cost-per-foot):
 *   C = (bitUsd + rigUsdPerHr·(drillHr + tripHr)) / meterageM
 */
export function costPerMeter(args: {
  bitUsd: number;
  rigUsdPerHr: number;
  drillHr: number;
  tripHr: number;
  meterageM: number;
}): number {
  if (args.meterageM <= 0) throw new Error("costPerMeter: meterageM must be > 0");
  return (args.bitUsd + args.rigUsdPerHr * (args.drillHr + args.tripHr)) / args.meterageM;
}

/** Trip-adjusted ROP (m/hr): meterage over drilling + tripping time. */
export function tripAdjustedRop(args: {
  meterageM: number;
  drillHr: number;
  tripHr: number;
}): number {
  const total = args.drillHr + args.tripHr;
  if (total <= 0) return 0;
  return args.meterageM / total;
}
