/**
 * Bit identity helpers for ROP-optimization grouping/classification.
 * Standalone — DrillIQ owns this code.
 */

/**
 * Parse a bit/hole size label into inches.
 * Handles `"12 1/4"`, `"12-1/4""`, `"3/4"`, `"5.875"`, `26"`. Rejects ≤0 / ≥60.
 */
export function parseBitSizeInches(label: string | null | undefined): number | null {
  if (label == null) return null;
  const s = String(label).replace(/["″]/g, "").trim();
  let val: number | null = null;
  let m = s.match(/^(\d+(?:\.\d+)?)$/); // plain "5.875" / "26"
  if (m) val = Number(m[1]);
  if (val == null) {
    m = s.match(/^(\d+)\s*[-\s]\s*(\d+)\/(\d+)$/); // "12 1/4" / "12-1/4"
    if (m) val = Number(m[1]) + Number(m[2]) / Number(m[3]);
  }
  if (val == null) {
    m = s.match(/^(\d+)\/(\d+)$/); // "3/4"
    if (m) val = Number(m[1]) / Number(m[2]);
  }
  if (val == null || val <= 0 || val >= 60) return null;
  return val;
}

export type BitClass = "PDC" | "roller";

/**
 * Classify a bit as PDC or roller-cone from its IADC code / type / diamond flag.
 * Letter-prefixed IADC (e.g. M241) ⇒ PDC; numeric IADC (e.g. 517) ⇒ roller.
 */
export function bitClass(args: {
  iadc?: string | null;
  type?: string | null;
  diamond?: boolean | null;
}): BitClass {
  const iadc = (args.iadc ?? "").trim();
  if (iadc) {
    if (/^[A-Za-z]/.test(iadc)) return "PDC";
    if (/^\d/.test(iadc)) return "roller";
  }
  if (args.diamond) return "PDC";
  const t = (args.type ?? "").toUpperCase();
  if (/PDC|DIAMOND|FIXED/.test(t)) return "PDC";
  if (/TCI|MILL|MT|ROLLER|CONE/.test(t)) return "roller";
  return "roller";
}

/** Leading IADC digit/series (used for the "bit type series" facet chips). */
export function iadcSeries(iadc: string | null | undefined): string | null {
  const s = (iadc ?? "").trim();
  const m = s.match(/^(\d)/);
  return m ? m[1]! : null;
}

/** Parse a nozzle-size string like "3 x 14, 12" into 32nds sizes. */
export function parseNozzleSizes(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const out: number[] = [];
  // tokens like "3x14" (count x size) or bare "14"
  for (const tok of String(raw).split(/[,;/]+/)) {
    const mult = tok.match(/(\d+)\s*[xX*]\s*(\d+)/);
    if (mult) {
      const count = Number(mult[1]);
      const size = Number(mult[2]);
      for (let i = 0; i < count; i++) out.push(size);
      continue;
    }
    const m = tok.match(/(\d+)/);
    if (m) out.push(Number(m[1]));
  }
  return out.filter((n) => n > 0 && n < 64);
}
