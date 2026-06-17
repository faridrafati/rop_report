/**
 * Shared contract for the ROP-optimization feature — used by both /api (response
 * shaping + validation) and /web (the tab). Standalone to DrillIQ.
 */
import { z } from "zod";

/** Request filters for POST /api/rop-optimization. */
export const RopOptimizationFiltersSchema = z.object({
  wellIds: z.array(z.string().uuid()).optional(),
  holeSizes: z.array(z.string()).optional(),
  mudTypeIds: z.array(z.string().uuid()).optional(),
  bitFamilies: z.array(z.enum(["TCI", "MILLED_TOOTH", "PDC", "DIAMOND", "OTHER"])).optional(),
  formationIds: z.array(z.string().uuid()).optional(),
  depthFrom: z.number().optional(),
  depthTo: z.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
export type RopOptimizationFilters = z.infer<typeof RopOptimizationFiltersSchema>;

/**
 * One operating point derived from a bit run. Depths in METERS, ROP in m/hr
 * (SI storage); WOB in lbf, torque ft-lbf, MSE psi, HSI hhp/in² (formula units).
 */
export interface RopPoint {
  bitRunId: string;
  wellId: string;
  wellName: string;
  wellboreId: string;
  // operating parameters
  wob: number | null; // lbf
  rpm: number | null;
  torque: number | null; // ft-lbf
  ropMhr: number | null; // m/hr (SI)
  ropFthr: number | null; // ft/hr (formula/display)
  flow: number | null; // gpm
  mwPpg: number | null; // ppg
  // computed metrics
  mse: number | null; // psi
  mseEstimated: boolean; // true when torque was estimated
  hsi: number | null;
  hsiSource: "reported" | "computed" | null;
  costPerMeter: number | null;
  // bit identity
  diaIn: number | null;
  bitSize: string | null; // normalized label e.g. 12-1/4"
  bitClass: "PDC" | "roller" | null;
  iadc: string | null;
  make: string | null;
  // geometry / context
  depthIn: number | null; // m
  depthOut: number | null; // m
  meters: number | null; // footage in m
  bitHour: number | null;
  reasonCode: string | null;
  reasonLabel: string | null;
  topFormation: string | null;
  // dull grade (final, decoded title)
  dullTitle: string | null;
}

export interface RopData {
  points: RopPoint[];
  bitSizes: string[]; // distinct, sorted widest→narrowest
  total: number;
  truncated: boolean;
  note?: string;
}
