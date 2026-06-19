/**
 * Drilling dysfunction classifiers — docs/domain-formulas.md §10.
 *
 * Pure, side-effect-free heuristics over the per-bit-run signals DrillIQ has
 * (bit-specific friction μ, HSI, MSE efficiency, RPM/WOB, gauge wear, and
 * ROP/MSE trend flags). Each named dysfunction is flagged with a coarse
 * confidence and the mitigation from the formula doc. Conservative by design:
 * a signal that is `undefined` never triggers a flag.
 *
 * | Dysfunction | Induced by | Signature                                   | Mitigation        |
 * | stick-slip  | WOB ↑      | torque/RPM cyclic osc.; high μ swings        | raise RPM         |
 * | whirl       | RPM ↑      | high lateral vib.; over-gauge; high torque   | lower RPM         |
 * | bit bounce  | hard fmn   | axial WOB oscillation                        | adjust WOB/RPM    |
 * | bit balling | cleaning   | rising MSE & torque at flat ROP; low HSI     | improve cleaning  |
 */

export type Dysfunction = "stick_slip" | "whirl" | "bit_bounce" | "bit_balling";

/** Available per-run signals; any field may be omitted (omitted ⇒ not assessed). */
export interface DysfunctionSignal {
  /** bit-specific sliding friction μ (Pessier/Fear) */
  mu?: number;
  /** hydraulic horsepower per in² (HSI) */
  hsi?: number;
  /** MSE efficiency fraction (CCS/MSE); good ≈ 0.35 */
  mseEfficiency?: number;
  /** rotary speed N (rpm) */
  rpm?: number;
  /** weight on bit (lbf) */
  wob?: number;
  /** gauge condition: 0 = in-gauge, >0 = out-of-gauge (1/16" units) */
  gaugeWear?: number;
  /** trend: ROP has flattened across the interval/sweep */
  ropFlat?: boolean;
  /** trend: MSE is rising across the interval/sweep */
  mseRising?: boolean;
  /** explicit axial-oscillation indicator (bit bounce is hard to infer from scalars) */
  axialOscillation?: boolean;
}

export interface DysfunctionFinding {
  type: Dysfunction;
  /** 0..1 coarse confidence */
  confidence: number;
  reason: string;
  mitigation: string;
}

/** Documented decision thresholds (see §2, §3, §9). */
export const DYSFUNCTION_THRESHOLDS = {
  /** μ above this is "over-torque" (typical drilling μ ~0.2–0.9, §2) */
  muHigh: 0.8,
  /** HSI below the optimum cleaning band 2.5–5.0 (§3) ⇒ under-cleaning */
  hsiUnderClean: 2.5,
  /** RPM at/above this favours RPM-induced whirl */
  rpmHigh: 150,
  /** MSE efficiency below this is severe inefficiency (§9) */
  mseEfficiencyLow: 0.1,
} as const;

const T = DYSFUNCTION_THRESHOLDS;
const def = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);

/** Bit balling: low HSI (under-cleaning) with rising MSE at flat ROP, or over-torque (§3, §9, §10). */
export function classifyBalling(s: DysfunctionSignal): DysfunctionFinding | null {
  const lowHsi = def(s.hsi) && s.hsi < T.hsiUnderClean;
  const energyStall = s.mseRising === true && s.ropFlat === true;
  const overTorque = def(s.mu) && s.mu >= T.muHigh;
  if (!lowHsi && !(energyStall && overTorque)) return null;
  const confidence = lowHsi && energyStall ? 0.85 : lowHsi && overTorque ? 0.7 : lowHsi ? 0.5 : 0.6;
  return {
    type: "bit_balling",
    confidence,
    reason:
      `${lowHsi ? `HSI ${s.hsi!.toFixed(2)} < ${T.hsiUnderClean} (under-cleaning)` : "over-torque"}` +
      `${energyStall ? "; MSE rising while ROP flat" : ""}`,
    mitigation: "Improve hole cleaning — raise HSI/flow rate, treat mud (reduce stickiness).",
  };
}

/** RPM-induced whirl: high RPM with over-torque or out-of-gauge wear (§10). */
export function classifyWhirl(s: DysfunctionSignal): DysfunctionFinding | null {
  if (!def(s.rpm) || s.rpm < T.rpmHigh) return null;
  const overTorque = def(s.mu) && s.mu >= T.muHigh;
  const overGauge = def(s.gaugeWear) && s.gaugeWear > 0;
  if (!overTorque && !overGauge) return null;
  return {
    type: "whirl",
    confidence: overTorque && overGauge ? 0.8 : 0.6,
    reason:
      `High RPM ${s.rpm} with ${overTorque ? `high μ ${s.mu!.toFixed(2)}` : ""}` +
      `${overTorque && overGauge ? " and " : ""}${overGauge ? "out-of-gauge wear" : ""}`,
    mitigation: "Lower RPM (maintain or increase WOB) to suppress lateral whirl.",
  };
}

/** WOB-induced stick-slip: high μ at low/moderate RPM (torsional over-torque) (§10). */
export function classifyStickSlip(s: DysfunctionSignal): DysfunctionFinding | null {
  if (!def(s.mu) || s.mu < T.muHigh) return null;
  // Distinguish from whirl: stick-slip when RPM is NOT high.
  if (def(s.rpm) && s.rpm >= T.rpmHigh) return null;
  return {
    type: "stick_slip",
    confidence: 0.65,
    reason: `High μ ${s.mu.toFixed(2)} at ${def(s.rpm) ? `RPM ${s.rpm}` : "low/unknown RPM"} — torsional over-torque`,
    mitigation: "Raise RPM (and/or reduce WOB) to break the stick-slip cycle.",
  };
}

/** Axial bit bounce: explicit axial-oscillation indicator (§10). */
export function classifyBitBounce(s: DysfunctionSignal): DysfunctionFinding | null {
  if (s.axialOscillation !== true) return null;
  return {
    type: "bit_bounce",
    confidence: 0.6,
    reason: "Axial WOB oscillation reported (typically hard/interbedded formation)",
    mitigation: "Adjust WOB/RPM and add damping (shock sub) to reduce axial vibration.",
  };
}

/** Run all classifiers; return findings sorted by descending confidence. */
export function classifyDysfunctions(s: DysfunctionSignal): DysfunctionFinding[] {
  return [classifyBalling(s), classifyWhirl(s), classifyStickSlip(s), classifyBitBounce(s)]
    .filter((f): f is DysfunctionFinding => f !== null)
    .sort((a, b) => b.confidence - a.confidence);
}
