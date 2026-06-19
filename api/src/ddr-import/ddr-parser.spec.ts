import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseDdr } from './ddr-parser';

// Layout text produced by pdfToLayoutText() from the real wellsite report
// "Daily Drilling Report 31, SPD20-14, P-200 Rig" — the canonical import sample.
const layout = readFileSync(join(__dirname, '__fixtures__', 'ddr-spd20-14.layout.txt'), 'utf8');

describe('parseDdr (SPD20-14 DDR #31)', () => {
  const ddr = parseDdr(layout);

  it('extracts the report header', () => {
    expect(ddr.ddrNo).toBe(31);
    expect(ddr.reportDate).toBe('2026-05-26');
    expect(ddr.wellName).toBe('SPD20-14');
    expect(ddr.fieldName).toBe('South Pars Gas field');
    expect(ddr.rigNumber).toBe('P-200');
    expect(ddr.contractor).toBe('OKDC');
    expect(ddr.spudDate).toBe('2026-04-25');
  });

  it('extracts depths, progress and head count', () => {
    expect(ddr.startDepthMd).toBe(917);
    expect(ddr.endDepthMd).toBe(967);
    expect(ddr.depthProgressM).toBeCloseTo(50.02, 2);
    expect(ddr.avgRopMhr).toBeCloseTo(2.5, 1);
    expect(ddr.headCount).toBe(105);
  });

  it('extracts the narrative sections', () => {
    expect(ddr.operationsAtReportTime).toMatch(/Drilling 24/);
    expect(ddr.operationsSummary).toMatch(/917m to 967m/);
  });

  it('parses all four activity rows with codes', () => {
    expect(ddr.activities).toHaveLength(4);
    expect(ddr.activities[0]).toMatchObject({ startTime: '00:00', durationHr: 12, code1: 'DRL1', isProductive: true });
    expect(ddr.activities[2].code1).toBe('SN1');
    expect(ddr.activities.every((a) => a.description.length > 0)).toBe(true);
  });

  it('extracts the mud check', () => {
    expect(ddr.fluid?.densityPpg).toBeCloseTo(8.6, 2);
    expect(ddr.fluid?.funnelVisc).toBe(26);
    expect(ddr.fluid?.ph).toBeCloseTo(8, 1);
  });

  it('extracts the bit run identity and the drilling-parameter table', () => {
    expect(ddr.bit?.sizeIn).toBe(24);
    expect(ddr.bit?.model).toBe('KHD435GC');
    expect(ddr.bit?.iadc).toBe('435');
    expect(ddr.bit?.make).toBe('Kingdream');
    expect(ddr.bit?.serial).toBe('2503307JH');
    expect(ddr.bit?.tfaIn2).toBeCloseTo(1.48, 2);
    expect(ddr.parameters).toHaveLength(8);
  });

  it('reports no parser warnings for the well-formed sample', () => {
    expect(ddr.warnings).toEqual([]);
  });
});
