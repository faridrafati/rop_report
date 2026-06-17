/**
 * Shared Zod schemas — the contracts reused between /api (validation) and /web
 * (forms). Drilling-domain enumerations mirror the Prisma enums in db/.
 */
import { z } from "zod";

export const RoleSchema = z.enum([
  "MANAGEMENT",
  "OFFICE_ENGINEER",
  "OPERATION_ENGINEER",
  "CONTRACTOR",
]);
export type Role = z.infer<typeof RoleSchema>;

export const BitFamilySchema = z.enum(["TCI", "MILLED_TOOTH", "PDC", "DIAMOND", "OTHER"]);
export type BitFamily = z.infer<typeof BitFamilySchema>;

export const BitClassSchema = z.enum(["N", "U"]);

export const ActivityClassSchema = z.enum(["PLANNED", "UNPLANNED", "DOWNTIME"]);

/** IADC dull-characteristic codes (positions 3 & 7). */
export const DULL_CHAR_CODES = [
  "BC", "BT", "BU", "CC", "CD", "CI", "CR", "CT", "ER", "FC", "HC", "JD",
  "LC", "LN", "LT", "NO", "NR", "OC", "PB", "PN", "RG", "RO", "RR", "SD",
  "SS", "TR", "WO", "WT", "BF",
] as const;
export const DullCharSchema = z.enum(DULL_CHAR_CODES);

/** One IADC 8-position dull grade (init or final). */
export const DullGradeSchema = z.object({
  inner: z.number().int().min(0).max(8).nullable(), // (1) inner cutting structure
  outer: z.number().int().min(0).max(8).nullable(), // (2) outer cutting structure
  dullChar: DullCharSchema.nullable(), // (3) dull characteristic
  location: z.string().max(8).nullable(), // (4) location
  bearing: z.string().max(8).nullable(), // (5) bearings/seals (PDC = 'X')
  gauge: z.string().max(8).nullable(), // (6) gauge ('I' or 1/16" undergauge)
  other: DullCharSchema.nullable(), // (7) other dull characteristic
  reason: z.string().max(8).nullable(), // (8) reason pulled
});
export type DullGrade = z.infer<typeof DullGradeSchema>;

/** Inputs accepted by the analytics engine for a bit-run computation. */
export const BitRunMetricsInputSchema = z.object({
  diaBitIn: z.number().positive(),
  wobLbf: z.number().nonnegative().optional(),
  rpm: z.number().nonnegative().optional(),
  torqueFtLbf: z.number().nonnegative().optional(),
  ropFtHr: z.number().positive().optional(),
  mwPpg: z.number().positive().optional(),
  qGpm: z.number().positive().optional(),
  tfaIn2: z.number().positive().optional(),
  bitCost: z.number().nonnegative().optional(),
  rigRate: z.number().nonnegative().optional(),
  rotatingHr: z.number().nonnegative().optional(),
  tripHr: z.number().nonnegative().optional(),
  footageFt: z.number().positive().optional(),
});
export type BitRunMetricsInput = z.infer<typeof BitRunMetricsInputSchema>;

/** ROP-prediction request mirrored by the (deferred) ML service. */
export const RopPredictorsSchema = z.object({
  wob: z.number(),
  rpm: z.number(),
  torque: z.number(),
  flow: z.number(),
  mudWeight: z.number(),
  tfa: z.number(),
  depth: z.number(),
  lithology: z.string().optional(),
});
export type RopPredictors = z.infer<typeof RopPredictorsSchema>;
