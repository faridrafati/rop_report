/**
 * Unit conversions. DrillIQ stores depths/lengths in METERS (SI) internally and
 * converts to field/imperial units only when feeding the drilling formulas or
 * rendering at the UI (see docs/domain-formulas.md §13).
 */

export const M_PER_FT = 0.3048;

/** meters → feet */
export const metersToFeet = (m: number): number => m / M_PER_FT;
/** feet → meters */
export const feetToMeters = (ft: number): number => ft * M_PER_FT;

/** inches → meters */
export const inchesToMeters = (inch: number): number => inch * 0.0254;
/** meters → inches */
export const metersToInches = (m: number): number => m / 0.0254;

// Field ⇄ metric converters used by the ROP-optimization analytics.
export const LBF_PER_TONNE = 2204.62;
export const FTLBF_PER_KNM = 737.562;

/** metric tonnes-force → lbf (WOB) */
export const tonnesToLbf = (t: number): number => t * LBF_PER_TONNE;
/** lbf → metric tonnes-force */
export const lbfToTonnes = (lbf: number): number => lbf / LBF_PER_TONNE;
/** klbf → metric tonnes-force */
export const klbToTonnes = (klb: number): number => (klb * 1000) / LBF_PER_TONNE;
/** kN·m → ft-lbf (torque) */
export const knmToFtLbf = (knm: number): number => knm * FTLBF_PER_KNM;
/** m/hr → ft/hr (ROP) */
export const mhrToFthr = (mhr: number): number => mhr * (1 / M_PER_FT);
/** ft/hr → m/hr (ROP) */
export const fthrToMhr = (fthr: number): number => fthr * M_PER_FT;
