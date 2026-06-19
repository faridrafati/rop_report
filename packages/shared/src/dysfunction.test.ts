import { describe, it, expect } from "vitest";
import {
  classifyDysfunctions,
  classifyBalling,
  classifyWhirl,
  classifyStickSlip,
  classifyBitBounce,
} from "./dysfunction.js";

describe("dysfunction classifiers (§10)", () => {
  it("flags bit balling on low HSI with rising MSE at flat ROP", () => {
    const f = classifyBalling({ hsi: 1.8, mseRising: true, ropFlat: true });
    expect(f).not.toBeNull();
    expect(f!.type).toBe("bit_balling");
    expect(f!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(f!.mitigation).toMatch(/cleaning/i);
  });

  it("flags whirl on high RPM with over-torque", () => {
    const f = classifyWhirl({ rpm: 180, mu: 0.9 });
    expect(f).not.toBeNull();
    expect(f!.type).toBe("whirl");
    expect(f!.mitigation).toMatch(/lower rpm/i);
  });

  it("flags stick-slip on high μ at moderate RPM (not whirl)", () => {
    const f = classifyStickSlip({ mu: 0.85, rpm: 90 });
    expect(f).not.toBeNull();
    expect(f!.type).toBe("stick_slip");
    expect(f!.mitigation).toMatch(/raise rpm/i);
    // same μ but high RPM should NOT be stick-slip (it's whirl territory)
    expect(classifyStickSlip({ mu: 0.85, rpm: 180 })).toBeNull();
  });

  it("flags bit bounce only on explicit axial oscillation", () => {
    expect(classifyBitBounce({ axialOscillation: true })!.type).toBe("bit_bounce");
    expect(classifyBitBounce({ wob: 40000 })).toBeNull();
  });

  it("returns nothing for healthy parameters", () => {
    expect(classifyDysfunctions({ mu: 0.45, hsi: 3.5, rpm: 120, ropFlat: false })).toHaveLength(0);
  });

  it("aggregates and sorts findings by confidence", () => {
    const findings = classifyDysfunctions({ hsi: 1.5, mseRising: true, ropFlat: true, mu: 0.9, rpm: 180 });
    expect(findings.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < findings.length; i++) {
      expect(findings[i - 1]!.confidence).toBeGreaterThanOrEqual(findings[i]!.confidence);
    }
  });
});
