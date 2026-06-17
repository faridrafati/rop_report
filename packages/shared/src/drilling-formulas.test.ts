/**
 * Tests for the drilling analytics engine. Every assertion is pinned to a
 * worked example in docs/domain-formulas.md so unit errors surface immediately.
 */
import { describe, it, expect } from "vitest";
import {
  bitArea,
  mse,
  mseEfficiency,
  slidingFriction,
  totalFlowArea,
  bitPressureDrop,
  hydraulicHorsepower,
  hsi,
  hsiFromHydraulics,
  isHsiOptimal,
  costPerFoot,
  effectiveRop,
  detectFounderPoint,
} from "./drilling-formulas.js";
import { metersToFeet, feetToMeters } from "./units.js";

describe("bitArea", () => {
  it("12-1/4in bit ⇒ 117.859 in² (§1)", () => {
    expect(bitArea(12.25)).toBeCloseTo(117.859, 2);
  });
});

describe("MSE (Teale 1965)", () => {
  // §1 worked example: WOB=35000, N=100, T=6000, ROP=80, D_B=12.25 ⇒ ≈24,287 psi
  it("matches the §1 worked example ≈ 24,287 psi", () => {
    const value = mse(35000, 100, 6000, 80, 12.25);
    expect(value).toBeCloseTo(24287, -1); // within ~10 psi
  });
  it("WOB term and torque term decompose correctly", () => {
    const wobTerm = 35000 / bitArea(12.25);
    expect(wobTerm).toBeCloseTo(297.0, 0);
  });
});

describe("mseEfficiency", () => {
  it("efficiency = CCS / MSE", () => {
    expect(mseEfficiency(20000, 7000)).toBeCloseTo(0.35, 2);
  });
});

describe("slidingFriction (Pessier/Fear)", () => {
  // §2: T=6000, D_B=12.25, WOB=35000 ⇒ ≈ 0.504
  it("matches the §2 worked example ≈ 0.504", () => {
    expect(slidingFriction(6000, 12.25, 35000)).toBeCloseTo(0.504, 3);
  });
});

describe("totalFlowArea", () => {
  // §5: three 20/32" ⇒ 0.9204 in²; three 13/32" ⇒ 0.3889 in²
  it("three 20/32in nozzles ⇒ 0.9204 in²", () => {
    expect(totalFlowArea([20, 20, 20])).toBeCloseTo(0.9204, 4);
  });
  it("three 13/32in nozzles ⇒ 0.3889 in²", () => {
    expect(totalFlowArea([13, 13, 13])).toBeCloseTo(0.3889, 4);
  });
});

describe("bitPressureDrop", () => {
  // §4: MW=10, Q=750, TFA=0.9204 ⇒ ≈ 611.5 psi
  it("matches the §4 worked example ≈ 611.5 psi", () => {
    expect(bitPressureDrop(10.0, 750, 0.9204)).toBeCloseTo(611.5, 0);
  });
});

describe("hydraulic horsepower & HSI", () => {
  // §3: P_bit≈611.5, Q=750 ⇒ HHP_b≈267.6; HSI≈2.26
  it("HHP_b ≈ 267.6 hhp", () => {
    expect(hydraulicHorsepower(611.5, 750)).toBeCloseTo(267.6, 0);
  });
  it("HSI ≈ 2.26 hhp/in²", () => {
    expect(hsi(267.6, 12.25)).toBeCloseTo(2.26, 2);
  });
  it("hsiFromHydraulics chains §4→§3 ⇒ ≈ 2.26", () => {
    expect(hsiFromHydraulics(10.0, 750, 0.9204, 12.25)).toBeCloseTo(2.26, 1);
  });
  it("isHsiOptimal flags the 2.5–5.0 band", () => {
    expect(isHsiOptimal(2.26)).toBe(false);
    expect(isHsiOptimal(3.5)).toBe(true);
    expect(isHsiOptimal(6.0)).toBe(false);
  });
});

describe("costPerFoot — CANONICAL FIXTURE", () => {
  // §6 normative: B=27000, t=50, R=3500, T=12, F=5000 ⇒ 48.8 $/ft
  it("asserts C == 48.8 for the canonical inputs", () => {
    expect(costPerFoot(27000, 3500, 50, 12, 5000)).toBeCloseTo(48.8, 5);
  });
  it("throws when footage is zero", () => {
    expect(() => costPerFoot(27000, 3500, 50, 12, 0)).toThrow();
  });
});

describe("effectiveRop", () => {
  it("footage / (rotating + trip + connection)", () => {
    // 5000 ft over 50+12 hr ⇒ 80.645 ft/hr
    expect(effectiveRop(5000, 50, 12)).toBeCloseTo(80.645, 2);
    // adding connection time lowers it
    expect(effectiveRop(5000, 50, 12, 8)).toBeCloseTo(71.43, 1);
  });
});

describe("detectFounderPoint", () => {
  it("flags founder where ROP flattens & MSE rises (§8 illustrative)", () => {
    // ROP ~linear to 40k, then flattens while MSE rises.
    const sweep = [
      { wob: 25000, rop: 50, mse: 18000 },
      { wob: 30000, rop: 75, mse: 18500 }, // baseline slope 25/5000
      { wob: 35000, rop: 98, mse: 19000 },
      { wob: 40000, rop: 105, mse: 21000 }, // slope drops, MSE up ⇒ founder ~40k
      { wob: 45000, rop: 106, mse: 24000 },
    ];
    const r = detectFounderPoint(sweep);
    expect(r.foundered).toBe(true);
    expect(r.founderWob).toBe(35000); // last efficient point before the flatten
  });
  it("no founder for a linear sweep", () => {
    const sweep = [
      { wob: 20000, rop: 40 },
      { wob: 25000, rop: 65 },
      { wob: 30000, rop: 90 },
      { wob: 35000, rop: 115 },
    ];
    expect(detectFounderPoint(sweep).foundered).toBe(false);
  });
  it("needs >= 3 points", () => {
    expect(detectFounderPoint([{ wob: 1, rop: 1 }]).foundered).toBe(false);
  });
});

describe("unit conversions", () => {
  it("meters↔feet round-trips", () => {
    expect(metersToFeet(feetToMeters(5000))).toBeCloseTo(5000, 6);
  });
  it("3000 m ≈ 9842.5 ft", () => {
    expect(metersToFeet(3000)).toBeCloseTo(9842.52, 2);
  });
});
