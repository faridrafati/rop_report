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

/** Drilling dysfunction flags captured per bit run (§10). */
export const DysfunctionFlagsSchema = z.object({
  stickSlip: z.boolean().optional(),
  whirl: z.boolean().optional(),
  bitBounce: z.boolean().optional(),
  bitBalling: z.boolean().optional(),
});
export type DysfunctionFlags = z.infer<typeof DysfunctionFlagsSchema>;

/** Capture contract — create a bit run (Phase 3, Operation Engineer). */
export const CreateBitRunSchema = z.object({
  wellboreId: z.string().uuid(),
  wellSectionId: z.string().uuid().nullish(),
  bitMasterId: z.string().uuid(),
  numBit: z.number().int().positive().nullish(),
  depthIn: z.number().nonnegative().nullish(),
  depthOut: z.number().nonnegative().nullish(),
  footage: z.number().nonnegative().nullish(),
  rotatingHours: z.number().nonnegative().nullish(),
  tripHours: z.number().nonnegative().nullish(),
  wob: z.number().nonnegative().nullish(),
  rpm: z.number().nonnegative().nullish(),
  torque: z.number().nonnegative().nullish(),
  rop: z.number().nonnegative().nullish(),
  flowRate: z.number().nonnegative().nullish(),
  mudWeight: z.number().nonnegative().nullish(),
  reasonPulledId: z.string().uuid().nullish(),
  dhMotorTypeId: z.string().uuid().nullish(),
  bitClass: BitClassSchema.nullish(),
  condInit: DullGradeSchema.nullish(),
  condFinal: DullGradeSchema.nullish(),
  dysfunction: DysfunctionFlagsSchema.nullish(),
});
export type CreateBitRunInput = z.infer<typeof CreateBitRunSchema>;

/** Capture contract — one activity line in a DDR. */
export const CreateActivitySchema = z.object({
  activityTypeId: z.string().uuid().nullish(),
  iadcOpCode: z.string().max(16).nullish(),
  startTime: z.string().datetime().nullish(),
  endTime: z.string().datetime().nullish(),
  durationHr: z.number().nonnegative().nullish(),
  depthMd: z.number().nonnegative().nullish(),
  classification: ActivityClassSchema,
  isProductive: z.boolean(),
  nptCategory: z.string().max(64).nullish(),
  description: z.string().max(2000).nullish(),
});
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;

/** Capture contract — one fluid check in a DDR. */
export const CreateFluidSchema = z.object({
  mudTypeId: z.string().uuid().nullish(),
  checkDepthMd: z.number().nonnegative().nullish(),
  mw: z.number().nonnegative().nullish(),
  pv: z.number().nonnegative().nullish(),
  yp: z.number().nonnegative().nullish(),
  gel10s: z.number().nonnegative().nullish(),
  gel10m: z.number().nonnegative().nullish(),
  ph: z.number().min(0).max(14).nullish(),
  ecd: z.number().nonnegative().nullish(),
  funnelVisc: z.number().nonnegative().nullish(),
  solidsPct: z.number().min(0).max(100).nullish(),
});
export type CreateFluidInput = z.infer<typeof CreateFluidSchema>;

/** Capture contract — create a daily drilling report with nested activities + fluids. */
export const CreateDailyReportSchema = z.object({
  wellboreId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "reportDate must be YYYY-MM-DD"),
  reportNo: z.number().int().nonnegative().nullish(),
  depthStartMd: z.number().nonnegative().nullish(),
  depthEndMd: z.number().nonnegative().nullish(),
  statusInfo: z.string().max(4000).nullish(),
  presentOperation: z.string().max(2000).nullish(),
  dayCost: z.number().nonnegative().nullish(),
  cumCost: z.number().nonnegative().nullish(),
  personnelCount: z.number().int().nonnegative().nullish(),
  incidents: z.string().max(4000).nullish(),
  activities: z.array(CreateActivitySchema).default([]),
  fluids: z.array(CreateFluidSchema).default([]),
});
export type CreateDailyReportInput = z.infer<typeof CreateDailyReportSchema>;

/** NPT rule (§ data-model): non-productive when not productive and unplanned/downtime. */
export function isNpt(a: { classification: string; isProductive: boolean }): boolean {
  return !a.isProductive && (a.classification === "UNPLANNED" || a.classification === "DOWNTIME");
}

// ───────────────────────── Plans & governance (Phase 5) ─────────────────────
export const PlanKindSchema = z.enum(["BIT_PROGRAM", "PARAMETER_OPT", "OFFSET_BENCHMARK"]);
export const PlanStatusSchema = z.enum(["DRAFT", "PROPOSED", "APPROVED", "REJECTED"]);
export const ApprovalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

/** Create an engineering plan (Office Engineer). */
export const CreatePlanSchema = z.object({
  wellId: z.string().uuid(),
  title: z.string().min(1).max(200),
  kind: PlanKindSchema,
});
export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;

/** Add a recommendation line to a plan (bit + parameter window). */
export const CreateRecommendationSchema = z.object({
  wellSectionId: z.string().uuid().nullish(),
  bitMasterId: z.string().uuid().nullish(),
  targetWob: z.number().nonnegative().nullish(),
  targetRpm: z.number().nonnegative().nullish(),
  targetFlow: z.number().nonnegative().nullish(),
  predictedRop: z.number().nonnegative().nullish(),
  predictedMse: z.number().nonnegative().nullish(),
  rationale: z.string().max(2000).nullish(),
});
export type CreateRecommendationInput = z.infer<typeof CreateRecommendationSchema>;

/** An approve/reject decision on a plan. */
export const ApprovalDecisionSchema = z.object({ comment: z.string().max(2000).nullish() });
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionSchema>;

/** Allowed plan state transitions (state machine). */
export const PLAN_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PROPOSED"],
  PROPOSED: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: ["PROPOSED"],
};
export function canTransition(from: string, to: string): boolean {
  return (PLAN_TRANSITIONS[from] ?? []).includes(to);
}

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
