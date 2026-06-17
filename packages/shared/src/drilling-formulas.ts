/**
 * DrillIQ drilling analytics — pure functions.
 *
 * Every equation here is the AUTHORITATIVE form from docs/domain-formulas.md.
 * DO NOT invent or "simplify" formulas. All inputs are in FIELD/IMPERIAL units
 * (lbf, in, ft, ft-lbf, ft/hr, gpm, ppg, psi) because the IADC/SPE constants
 * (120, 36, 1714, 1.27, 12031, Cd=0.95) are defined in those units. Callers
 * convert the metric stored values in (see units.ts) before calling these.
 *
 * Each function is pure and side-effect free so it is trivially unit-testable
 * against the worked examples in the formula doc.
 */

/** Nozzle discharge coefficient — fixed for DrillIQ (§4). */
export const NOZZLE_CD = 0.95;

/** Default sliding-friction μ by bit family, for torque estimation when unmeasured. */
export const MU_DEFAULT = { roller: 0.25, PDC: 0.5 } as const;

/**
 * Estimate downhole bit torque (ft-lbf) from WOB when torque is not measured,
 * inverting the Pessier/Fear relation:  T = μ·D_B·WOB / 36.
 */
export function estimateTorque(args: {
  mu: number;
  diaBitIn: number;
  wobLbf: number;
}): number {
  return (args.mu * args.diaBitIn * args.wobLbf) / 36;
}

/**
 * Bit cross-sectional area A_B = (π/4)·D_B²  (in²).
 * @param diaBitIn bit diameter D_B in inches.
 */
export function bitArea(diaBitIn: number): number {
  return (Math.PI / 4) * diaBitIn * diaBitIn;
}

/**
 * Mechanical Specific Energy (Teale 1965), psi.
 *   MSE = WOB/A_B + (120·π·N·T)/(A_B·ROP)
 * @param wobLbf   weight on bit (lbf)
 * @param rpm      rotary speed N (rpm)
 * @param torqueFtLbf bit torque T (ft-lbf)
 * @param ropFtHr  rate of penetration (ft/hr)
 * @param diaBitIn bit diameter D_B (in)
 */
export function mse(
  wobLbf: number,
  rpm: number,
  torqueFtLbf: number,
  ropFtHr: number,
  diaBitIn: number,
): number {
  const ab = bitArea(diaBitIn);
  const wobTerm = wobLbf / ab;
  const torqueTerm = (120 * Math.PI * rpm * torqueFtLbf) / (ab * ropFtHr);
  return wobTerm + torqueTerm;
}

/**
 * MSE energy efficiency relative to rock strength (fraction).
 * "Good drilling" ≈ 0.35 (§9). efficiency = CCS / MSE.
 * @param mseValuePsi computed MSE (psi)
 * @param ccsPsi      confined compressive strength of the rock (psi)
 */
export function mseEfficiency(mseValuePsi: number, ccsPsi: number): number {
  if (mseValuePsi <= 0) return 0;
  return ccsPsi / mseValuePsi;
}

/**
 * Bit-specific sliding-friction coefficient μ (Pessier/Fear), dimensionless.
 *   μ = 36·T / (D_B·WOB)
 */
export function slidingFriction(torqueFtLbf: number, diaBitIn: number, wobLbf: number): number {
  return (36 * torqueFtLbf) / (diaBitIn * wobLbf);
}

/**
 * Total Flow Area (TFA), in².  TFA = (π/4)·Σ (d_n/32)²
 * @param nozzles32nds array of nozzle sizes in 32nds of an inch (exclude blanked nozzles)
 */
export function totalFlowArea(nozzles32nds: number[]): number {
  const sumSq = nozzles32nds.reduce((acc, d) => acc + (d / 32) * (d / 32), 0);
  return (Math.PI / 4) * sumSq;
}

/**
 * Bit pressure drop P_bit, psi (field-units form, §4).
 *   P_bit = (MW·Q²) / (12031·Cd²·TFA²)
 * @param mwPpg   mud weight (ppg)
 * @param qGpm    flow rate (gpm)
 * @param tfaIn2  total flow area (in²)
 * @param cd      nozzle discharge coefficient (default 0.95)
 */
export function bitPressureDrop(
  mwPpg: number,
  qGpm: number,
  tfaIn2: number,
  cd: number = NOZZLE_CD,
): number {
  return (mwPpg * qGpm * qGpm) / (12031 * cd * cd * tfaIn2 * tfaIn2);
}

/**
 * Hydraulic horsepower at the bit, hhp.  HHP_b = (P_bit·Q)/1714
 */
export function hydraulicHorsepower(pBitPsi: number, qGpm: number): number {
  return (pBitPsi * qGpm) / 1714;
}

/**
 * Hydraulic horsepower per square inch (HSI), hhp/in².
 *   HSI = 1.27·HHP_b / D_B²   (optimum 2.5–5.0)
 */
export function hsi(hhpBit: number, diaBitIn: number): number {
  return (1.27 * hhpBit) / (diaBitIn * diaBitIn);
}

/** Convenience: HSI directly from hydraulic inputs. */
export function hsiFromHydraulics(
  mwPpg: number,
  qGpm: number,
  tfaIn2: number,
  diaBitIn: number,
  cd: number = NOZZLE_CD,
): number {
  const p = bitPressureDrop(mwPpg, qGpm, tfaIn2, cd);
  const hhp = hydraulicHorsepower(p, qGpm);
  return hsi(hhp, diaBitIn);
}

/** Is HSI within the optimum bottom-hole cleaning band (2.5–5.0)? */
export function isHsiOptimal(hsiValue: number): boolean {
  return hsiValue >= 2.5 && hsiValue <= 5.0;
}

/**
 * Cost per foot, $/ft.  C = [B + R·(t + T)] / F
 * CANONICAL FIXTURE: B=27000, t=50, R=3500, T=12, F=5000 ⇒ 48.8.
 * @param bitCost   B  ($)
 * @param rigRate   R  ($/hr)
 * @param rotatingHr t (hr)
 * @param tripHr     T (hr)
 * @param footage    F (ft)
 */
export function costPerFoot(
  bitCost: number,
  rigRate: number,
  rotatingHr: number,
  tripHr: number,
  footage: number,
): number {
  if (footage <= 0) throw new Error("costPerFoot: footage F must be > 0");
  return (bitCost + rigRate * (rotatingHr + tripHr)) / footage;
}

/**
 * Effective (trip-time-adjusted) ROP, ft/hr.
 *   effectiveRop = footage / (rotating + trip + connection/flat)
 */
export function effectiveRop(
  footageFt: number,
  rotatingHr: number,
  tripHr: number,
  connectionHr = 0,
): number {
  const total = rotatingHr + tripHr + connectionHr;
  if (total <= 0) throw new Error("effectiveRop: total time must be > 0");
  return footageFt / total;
}

/** A single point on a drill-off / parameter sweep. */
export interface FounderPoint {
  /** weight on bit (lbf) */
  wob: number;
  /** rate of penetration (ft/hr) */
  rop: number;
  /** mechanical specific energy (psi), optional — strengthens detection */
  mse?: number;
}

export interface FounderResult {
  /** true when a founder (flounder) point was detected */
  foundered: boolean;
  /** the WOB at which ROP stopped responding linearly (lbf), or null */
  founderWob: number | null;
  /** index into the input series where founder begins, or null */
  founderIndex: number | null;
  reason: string;
}

/**
 * Founder-point detection over an ascending-WOB sweep (§8).
 *
 * ROP rises ≈linearly with WOB up to the founder point; beyond it ROP flattens
 * (sub-linear response). When MSE is supplied, a SIMULTANEOUS rise in MSE while
 * ROP flattens CONFIRMS founder (vs. mere noise).
 *
 * Heuristic: compare each step's marginal ROP/WOB slope to the slope of the
 * first (efficient) step. The founder point is the first step whose slope drops
 * below `slopeFraction` of the baseline slope (and, if MSE present, where MSE
 * is not falling).
 *
 * @param series points sorted by ascending WOB (caller's responsibility)
 * @param slopeFraction fraction of baseline slope below which we flag founder (default 0.5)
 */
export function detectFounderPoint(
  series: FounderPoint[],
  slopeFraction = 0.5,
): FounderResult {
  if (series.length < 3) {
    return {
      foundered: false,
      founderWob: null,
      founderIndex: null,
      reason: "need at least 3 points to assess founder",
    };
  }

  const slopeAt = (i: number): number => {
    const dW = series[i]!.wob - series[i - 1]!.wob;
    if (dW === 0) return 0;
    return (series[i]!.rop - series[i - 1]!.rop) / dW;
  };

  const baselineSlope = slopeAt(1);
  if (baselineSlope <= 0) {
    return {
      foundered: false,
      founderWob: null,
      founderIndex: null,
      reason: "ROP not increasing with WOB at the start of the sweep",
    };
  }

  for (let i = 2; i < series.length; i++) {
    const slope = slopeAt(i);
    const flattening = slope < slopeFraction * baselineSlope;
    const mseRising =
      series[i]!.mse === undefined ||
      series[i - 1]!.mse === undefined ||
      series[i]!.mse! >= series[i - 1]!.mse!;
    if (flattening && mseRising) {
      return {
        foundered: true,
        founderWob: series[i - 1]!.wob,
        founderIndex: i - 1,
        reason:
          series[i]!.mse !== undefined
            ? "ROP response dropped below half the baseline slope while MSE rose — founder confirmed"
            : "ROP response dropped below half the baseline slope — likely founder",
      };
    }
  }

  return {
    foundered: false,
    founderWob: null,
    founderIndex: null,
    reason: "ROP responded ~linearly across the sweep; no founder detected",
  };
}

export interface FounderCurvePoint {
  /** bin-center WOB (lbf) */
  wob: number;
  /** mean ROP in the bin (ft/hr) */
  rop: number;
  /** number of raw points in the bin */
  n: number;
}

export interface FounderCurveResult {
  curve: FounderCurvePoint[];
  founderWob: number | null;
  optimalWob: number | null;
  initialSlope: number;
}

/**
 * Drill-off / founder curve over a scatter of (WOB, ROP) points.
 *
 * Bins WOB into `bins` equal-width bins, takes mean ROP per non-empty bin, then
 * walks up the response and flags founder at the first bin whose marginal slope
 * falls below `threshold × initialSlope`. `optimalWob` is the bin just below the
 * founder point (the recommended operating WOB). Mirrors the directional-drilling
 * `founderPoint`, reimplemented standalone for DrillIQ.
 *
 * @param points raw operating points {wob (lbf), rop (ft/hr)}
 * @param bins   number of WOB bins (default 8)
 * @param threshold slope fraction below baseline that marks founder (default 0.3)
 */
export function founderCurve(
  points: { wob: number; rop: number }[],
  bins = 8,
  threshold = 0.3,
): FounderCurveResult {
  const valid = points.filter((p) => Number.isFinite(p.wob) && Number.isFinite(p.rop));
  if (valid.length < 3) {
    return { curve: [], founderWob: null, optimalWob: null, initialSlope: 0 };
  }
  const wobs = valid.map((p) => p.wob);
  const min = Math.min(...wobs);
  const max = Math.max(...wobs);
  if (max <= min) return { curve: [], founderWob: null, optimalWob: null, initialSlope: 0 };
  const width = (max - min) / bins;

  const acc: { sum: number; n: number }[] = Array.from({ length: bins }, () => ({ sum: 0, n: 0 }));
  for (const p of valid) {
    let idx = Math.floor((p.wob - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    acc[idx]!.sum += p.rop;
    acc[idx]!.n += 1;
  }
  const curve: FounderCurvePoint[] = [];
  for (let i = 0; i < bins; i++) {
    if (acc[i]!.n > 0) {
      curve.push({ wob: min + (i + 0.5) * width, rop: acc[i]!.sum / acc[i]!.n, n: acc[i]!.n });
    }
  }
  if (curve.length < 2) {
    return { curve, founderWob: null, optimalWob: null, initialSlope: 0 };
  }

  const slope = (a: FounderCurvePoint, b: FounderCurvePoint): number => {
    const dW = b.wob - a.wob;
    return dW === 0 ? 0 : (b.rop - a.rop) / dW;
  };
  const initialSlope = slope(curve[0]!, curve[1]!);
  if (initialSlope <= 0) {
    return { curve, founderWob: null, optimalWob: null, initialSlope };
  }
  for (let i = 2; i < curve.length; i++) {
    const s = slope(curve[i - 1]!, curve[i]!);
    if (s < threshold * initialSlope) {
      return {
        curve,
        founderWob: curve[i]!.wob,
        optimalWob: curve[i - 1]!.wob,
        initialSlope,
      };
    }
  }
  return { curve, founderWob: null, optimalWob: curve[curve.length - 1]!.wob, initialSlope };
}
