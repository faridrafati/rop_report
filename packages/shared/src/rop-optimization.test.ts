/**
 * Tests for the ROP-optimization analytics primitives (stats, cost, bit, founder
 * curve, torque estimation, metric converters). Standalone — no external project.
 */
import { describe, it, expect } from "vitest";
import { linearFit, powerLawFit, spearman, quantile, median, iqrFence, weightedMean } from "./stats.js";
import { costPerMeter, tripHours, tripAdjustedRop, rigUsdPerHr } from "./cost.js";
import { parseBitSizeInches, bitClass, iadcSeries, parseNozzleSizes } from "./bit.js";
import { estimateTorque, founderCurve, MU_DEFAULT } from "./drilling-formulas.js";
import { klbToTonnes, tonnesToLbf, knmToFtLbf } from "./units.js";

describe("linearFit", () => {
  it("fits a perfect line y = 2x + 1", () => {
    const f = linearFit([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(f.slope).toBeCloseTo(2, 6);
    expect(f.intercept).toBeCloseTo(1, 6);
    expect(f.r2).toBeCloseTo(1, 6);
  });
});

describe("powerLawFit", () => {
  it("recovers y = 4·x^(-0.5)", () => {
    const xs = [1, 4, 9, 16, 25];
    const ys = xs.map((x) => 4 * Math.pow(x, -0.5));
    const f = powerLawFit(xs, ys);
    expect(f.a).toBeCloseTo(4, 4);
    expect(f.b).toBeCloseTo(0.5, 4);
    expect(f.r2).toBeCloseTo(1, 6);
  });
});

describe("spearman", () => {
  it("perfect monotonic ⇒ +1", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6);
  });
  it("perfect inverse ⇒ -1", () => {
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 6);
  });
});

describe("quantile / median / iqrFence", () => {
  it("median of 1..5 is 3", () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3);
  });
  it("quantile interpolates", () => {
    expect(quantile([0, 10], 0.25)).toBeCloseTo(2.5, 6);
  });
  it("iqrFence returns Tukey bounds", () => {
    const f = iqrFence([1, 2, 3, 4, 5, 6, 7, 8, 100]);
    expect(f.hi).toBeGreaterThan(f.q3);
    expect(100).toBeGreaterThan(f.hi); // the 100 is an outlier
  });
});

describe("weightedMean", () => {
  it("footage-weighted ROP", () => {
    // ROP 50 over 100m, ROP 100 over 300m ⇒ (50*100 + 100*300)/400 = 87.5
    expect(weightedMean([50, 100], [100, 300])).toBeCloseTo(87.5, 6);
  });
});

describe("cost (metric)", () => {
  it("rigUsdPerHr divides by 24", () => {
    expect(rigUsdPerHr(24000)).toBe(1000);
  });
  it("costPerMeter", () => {
    // bit 50000 + 1000/hr*(40+10) over 500 m = (50000+50000)/500 = 200 $/m
    expect(costPerMeter({ bitUsd: 50000, rigUsdPerHr: 1000, drillHr: 40, tripHr: 10, meterageM: 500 })).toBeCloseTo(200, 6);
  });
  it("tripHours = 2*depth/speed + handling", () => {
    expect(tripHours({ depthM: 3000, tripSpeedMHr: 600, handlingHr: 2 })).toBeCloseTo(12, 6);
  });
  it("tripAdjustedRop", () => {
    expect(tripAdjustedRop({ meterageM: 500, drillHr: 40, tripHr: 10 })).toBeCloseTo(10, 6);
  });
});

describe("bit identity", () => {
  it("parseBitSizeInches handles fractions and decimals", () => {
    expect(parseBitSizeInches('12 1/4')).toBeCloseTo(12.25, 6);
    expect(parseBitSizeInches('12-1/4"')).toBeCloseTo(12.25, 6);
    expect(parseBitSizeInches("5.875")).toBeCloseTo(5.875, 6);
    expect(parseBitSizeInches("3/4")).toBeCloseTo(0.75, 6);
    expect(parseBitSizeInches("garbage")).toBeNull();
  });
  it("bitClass: letter IADC ⇒ PDC, numeric ⇒ roller", () => {
    expect(bitClass({ iadc: "M241" })).toBe("PDC");
    expect(bitClass({ iadc: "517" })).toBe("roller");
    expect(bitClass({ diamond: true })).toBe("PDC");
    expect(bitClass({ type: "TCI" })).toBe("roller");
  });
  it("iadcSeries leading digit", () => {
    expect(iadcSeries("517")).toBe("5");
    expect(iadcSeries("M241")).toBeNull();
  });
  it("parseNozzleSizes handles count x size and bare", () => {
    expect(parseNozzleSizes("3 x 14, 12")).toEqual([14, 14, 14, 12]);
  });
});

describe("estimateTorque (inverse Pessier/Fear)", () => {
  it("T = mu*D*WOB/36", () => {
    // roller mu=0.25, D=8.5, WOB=15000 ⇒ 0.25*8.5*15000/36 = 885.4167
    expect(estimateTorque({ mu: MU_DEFAULT.roller, diaBitIn: 8.5, wobLbf: 15000 })).toBeCloseTo(885.4167, 3);
  });
});

describe("founderCurve", () => {
  it("bins WOB and finds founder where ROP flattens", () => {
    const pts: { wob: number; rop: number }[] = [];
    // linear ROP up to 40k, then flat
    for (let w = 10000; w <= 40000; w += 2000) pts.push({ wob: w, rop: w / 400 });
    for (let w = 42000; w <= 60000; w += 2000) pts.push({ wob: w, rop: 100 });
    const r = founderCurve(pts, 8);
    expect(r.curve.length).toBeGreaterThan(2);
    expect(r.founderWob).not.toBeNull();
    expect(r.optimalWob).not.toBeNull();
    expect(r.optimalWob!).toBeLessThan(r.founderWob!);
  });
  it("returns empty for < 3 points", () => {
    expect(founderCurve([{ wob: 1, rop: 1 }]).curve).toEqual([]);
  });
});

describe("metric converters", () => {
  it("klbToTonnes", () => {
    expect(klbToTonnes(44.0924)).toBeCloseTo(20, 3);
  });
  it("tonnesToLbf round-trips with klbToTonnes scale", () => {
    expect(tonnesToLbf(20)).toBeCloseTo(44092.4, 1);
  });
  it("knmToFtLbf", () => {
    expect(knmToFtLbf(1)).toBeCloseTo(737.562, 3);
  });
});
