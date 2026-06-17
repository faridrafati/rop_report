/**
 * DrillIQ seed.
 *
 * Loads the real NIDC reference vocabulary from ../seed-data/*.json (extracted
 * from the legacy drilling DB) into the lookup tables, then creates two demo
 * tenants (clients) with a user + well each — enough to exercise RLS isolation.
 *
 * Idempotent: uses upsert keyed on the unique legacy_code / code / email so it
 * can be re-run. Seeds connect as the migration/owner role (bypass RLS) so the
 * cross-tenant demo rows can be inserted; the APP connects as drilliq_app.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient, Role, BitFamily } from "@prisma/client";

const prisma = new PrismaClient();
const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(HERE, "..", "seed-data");

function load<T = any>(name: string): T[] {
  return JSON.parse(readFileSync(join(SEED_DIR, name), "utf-8"));
}

/** Parse a hole/nozzle label like `12-1/4"`, `8 1/2`, `7/32"` into inches. */
function parseInches(label: string | null | undefined): number | null {
  if (!label) return null;
  const s = String(label).replace(/["″\s]/g, "").trim();
  // fraction-only "7/32"
  let m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  // whole-fraction "12-1/4" or "8-1/2"
  m = s.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  // plain number "5.875" or "26"
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

function size32nds(label: string | null | undefined): number | null {
  const m = String(label ?? "").match(/(\d+)\/32/);
  return m ? Number(m[1]) : null;
}

/** Map a bit type string to a BitFamily enum. */
function bitFamily(type: string | null | undefined): BitFamily {
  const t = (type ?? "").toUpperCase();
  if (t.includes("PDC")) return BitFamily.PDC;
  if (t.includes("TCI")) return BitFamily.TCI;
  if (t.includes("MT") || t.includes("MILL")) return BitFamily.MILLED_TOOTH;
  if (t.includes("DIAMOND")) return BitFamily.DIAMOND;
  return BitFamily.OTHER;
}

async function seedLookups() {
  // Contractor
  for (const r of load("contractors.json")) {
    if (!r.code || !r.name) continue;
    await prisma.contractor.upsert({
      where: { legacyCode: r.code },
      update: { name: r.name },
      create: { legacyCode: r.code, name: r.name },
    });
  }
  // HoleSize
  for (const r of load("hole_sizes.json")) {
    if (!r.code) continue;
    await prisma.holeSize.upsert({
      where: { legacyCode: r.code },
      update: { label: r.label, diameterIn: parseInches(r.label) },
      create: { legacyCode: r.code, label: r.label, diameterIn: parseInches(r.label) },
    });
  }
  // NozzleSize
  for (const r of load("nozzle_sizes.json")) {
    if (!r.code) continue;
    await prisma.nozzleSize.upsert({
      where: { legacyCode: r.code },
      update: { label: r.label, size32nds: size32nds(r.label) },
      create: { legacyCode: r.code, label: r.label, size32nds: size32nds(r.label) },
    });
  }
  // MudType
  for (const r of load("mud_types.json")) {
    if (!r.code || !r.name) continue;
    await prisma.mudType.upsert({
      where: { legacyCode: r.code },
      update: { name: r.name, abbreviation: r.abbreviation ?? null },
      create: { legacyCode: r.code, name: r.name, abbreviation: r.abbreviation ?? null },
    });
  }
  // ReasonPulled (keyed on `code`)
  for (const r of load("reason_pulled.json")) {
    if (!r.code || !r.description) continue;
    const code = String(r.code).trim();
    await prisma.reasonPulled.upsert({
      where: { code },
      update: { description: r.description },
      create: { code, description: r.description },
    });
  }
  // WellType
  for (const r of load("well_types.json")) {
    if (!r.code || !r.name) continue;
    await prisma.wellType.upsert({
      where: { legacyCode: r.code },
      update: { name: r.name },
      create: { legacyCode: r.code, name: r.name },
    });
  }
  // WellProfile
  for (const r of load("well_profiles.json")) {
    if (!r.code || !r.name) continue;
    await prisma.wellProfile.upsert({
      where: { legacyCode: r.code },
      update: { name: r.name, abbreviation: r.abbreviation ?? null },
      create: { legacyCode: r.code, name: r.name, abbreviation: r.abbreviation ?? null },
    });
  }
  // DHMotorType
  for (const r of load("dhmotor_types.json")) {
    if (!r.code || !r.name) continue;
    await prisma.dHMotorType.upsert({
      where: { legacyCode: r.code },
      update: { name: r.name },
      create: { legacyCode: r.code, name: r.name },
    });
  }
  // ActivityType (keyed on `code`)
  for (const r of load("activity_types.json")) {
    if (!r.code || !r.name) continue;
    await prisma.activityType.upsert({
      where: { code: r.code },
      update: { name: r.name, groupCode: r.groupCode ?? null },
      create: { code: r.code, name: r.name, groupCode: r.groupCode ?? null },
    });
  }
  // Formation (global dictionary) — keyed on legacy_code
  for (const r of load("formations.json")) {
    if (!r.code || !r.nameEn) continue;
    await prisma.formation.upsert({
      where: { legacyCode: r.code },
      update: { abbreviation: r.abbreviation ?? null, nameEn: r.nameEn, nameFa: r.nameFa ?? null },
      create: {
        legacyCode: r.code,
        abbreviation: r.abbreviation ?? null,
        nameEn: r.nameEn,
        nameFa: r.nameFa ?? null,
      },
    });
  }
  // Lithology (global dictionary)
  for (const r of load("lithology.json")) {
    if (!r.code || !r.nameEn) continue;
    await prisma.lithology.upsert({
      where: { legacyCode: r.code },
      update: { name: r.nameEn },
      create: { legacyCode: r.code, name: r.nameEn },
    });
  }
}

async function seedDemoTenants() {
  // Two tenants to exercise RLS isolation. Deterministic UUIDs for test reuse.
  const CLIENT_A = "00000000-0000-0000-0000-0000000000aa";
  const CLIENT_B = "00000000-0000-0000-0000-0000000000bb";

  const clientA = await prisma.client.upsert({
    where: { id: CLIENT_A },
    update: {},
    create: { id: CLIENT_A, name: "NIOC (demo tenant A)", legacyCode: "A" },
  });
  const clientB = await prisma.client.upsert({
    where: { id: CLIENT_B },
    update: {},
    create: { id: CLIENT_B, name: "IMINOCO (demo tenant B)", legacyCode: "B" },
  });

  // A contractor (shared lookup) to attach a well to.
  const nidc = await prisma.contractor.findFirst({ where: { name: "NIDC" } });
  const explType = await prisma.wellType.findFirst();
  const vertical = await prisma.wellProfile.findFirst({ where: { name: "Vertical" } });

  for (const [client, wellName] of [
    [clientA, "WELL-A-001"],
    [clientB, "WELL-B-001"],
  ] as const) {
    await prisma.well.upsert({
      where: { clientId_name: { clientId: client.id, name: wellName } },
      update: {},
      create: {
        clientId: client.id,
        name: wellName,
        field: "Demo Field",
        contractorId: nidc?.id ?? null,
        wellTypeId: explType?.id ?? null,
        wellProfileId: vertical?.id ?? null,
        status: "DRILLING",
      },
    });
  }

  // A contractor user in each tenant (read-only role) for the isolation test.
  // Password hash is a placeholder; Phase 2 wires real auth.
  await prisma.user.upsert({
    where: { email: "contractor-a@demo.drilliq" },
    update: {},
    create: {
      clientId: clientA.id,
      email: "contractor-a@demo.drilliq",
      passwordHash: "PLACEHOLDER",
      role: Role.CONTRACTOR,
      displayName: "Contractor A",
    },
  });
  await prisma.user.upsert({
    where: { email: "contractor-b@demo.drilliq" },
    update: {},
    create: {
      clientId: clientB.id,
      email: "contractor-b@demo.drilliq",
      passwordHash: "PLACEHOLDER",
      role: Role.CONTRACTOR,
      displayName: "Contractor B",
    },
  });

  return { CLIENT_A, CLIENT_B };
}

/**
 * A handful of realistic bit runs for demo tenant A so the ROP-optimization tab
 * has something to render (founder / MSE / contour views). Idempotent: each row
 * uses a deterministic UUID and the whole step is skipped if bit runs exist for
 * the tenant. Depths/footage in METERS; WOB lbf, torque ft-lbf, ROP m/hr, flow
 * gpm, mud weight ppg — matching the schema's SI/field-unit conventions.
 */
async function seedDemoBitRuns(clientA: string) {
  const existing = await prisma.bitRun.count({ where: { clientId: clientA } });
  if (existing > 0) {
    console.log(`[seed] demo bit runs already present (${existing}); skipping.`);
    return;
  }

  const well = await prisma.well.findFirst({
    where: { clientId: clientA, name: "WELL-A-001" },
  });
  if (!well) {
    console.warn("[seed] WELL-A-001 not found; skipping demo bit runs.");
    return;
  }

  // Wellbore for the demo well (deterministic id).
  const WELLBORE_ID = "00000000-0000-0000-0000-00000000a001";
  const wellbore = await prisma.wellbore.upsert({
    where: { clientId_wellId_name: { clientId: clientA, wellId: well.id, name: "WB-A-001" } },
    update: {},
    create: {
      id: WELLBORE_ID,
      clientId: clientA,
      wellId: well.id,
      name: "WB-A-001",
      totalMd: 2800,
    },
  });

  // Resolve the two hole sizes we use (seeded by seedLookups via legacy code).
  const hs1214 = await prisma.holeSize.findFirst({ where: { label: '12-1/4"' } });
  const hs812 = await prisma.holeSize.findFirst({ where: { label: '8-1/2"' } });
  if (!hs1214 || !hs812) {
    console.warn("[seed] hole sizes 12-1/4\"/8-1/2\" not found; skipping demo bit runs.");
    return;
  }

  const reasonTd = await prisma.reasonPulled.findFirst({ where: { code: "TD" } });
  const reasonTq = await prisma.reasonPulled.findFirst({ where: { code: "TQ" } });

  // Two sections (one per hole size).
  const sec1 = await prisma.wellSection.upsert({
    where: { clientId_wellboreId_seq: { clientId: clientA, wellboreId: wellbore.id, seq: 1 } },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-0000000005ec",
      clientId: clientA,
      wellboreId: wellbore.id,
      holeSizeId: hs1214.id,
      seq: 1,
      topMd: 800,
      baseMd: 1900,
    },
  });
  const sec2 = await prisma.wellSection.upsert({
    where: { clientId_wellboreId_seq: { clientId: clientA, wellboreId: wellbore.id, seq: 2 } },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-0000000005ed",
      clientId: clientA,
      wellboreId: wellbore.id,
      holeSizeId: hs812.id,
      seq: 2,
      topMd: 1900,
      baseMd: 2800,
    },
  });

  // Two bit masters: a 12-1/4" PDC and an 8-1/2" TCI roller-cone.
  const bmPdc = await prisma.bitMaster.upsert({
    where: { id: "00000000-0000-0000-0000-00000000b10a" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-00000000b10a",
      clientId: clientA,
      serialNo: "PDC-12.25-001",
      manufacturer: "Smith",
      typeBit: "PDC",
      bitFamily: BitFamily.PDC,
      diaBit: 12.25,
      holeSizeId: hs1214.id,
      codeIadc: "M241",
      tfa: 0.7854, // ~ 6×13/32" nozzles
      bitCost: 45000,
    },
  });
  const bmTci = await prisma.bitMaster.upsert({
    where: { id: "00000000-0000-0000-0000-00000000b10b" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-00000000b10b",
      clientId: clientA,
      serialNo: "TCI-8.5-001",
      manufacturer: "Hughes",
      typeBit: "TCI",
      bitFamily: BitFamily.TCI,
      diaBit: 8.5,
      holeSizeId: hs812.id,
      codeIadc: "517",
      tfa: 0.5185,
      bitCost: 28000,
    },
  });

  // realistic runs: 12-1/4" PDC (high ROP) and 8-1/2" TCI (slower, harder rock).
  // wob lbf, rpm, torque ft-lbf, rop m/hr, footage m, rotatingHours, flow gpm, mw ppg.
  const runs: Array<{
    id: string;
    section: typeof sec1;
    bit: typeof bmPdc;
    numBit: number;
    depthIn: number;
    depthOut: number;
    footage: number;
    rotatingHours: number;
    tripHours: number;
    wob: number;
    rpm: number;
    torque: number;
    rop: number;
    flowRate: number;
    mudWeight: number;
    reasonId: string | null;
    dull: [number, number, string, string, string, string, string, string];
  }> = [
    // 12-1/4" PDC — ascending WOB sweep so the founder curve renders.
    {
      id: "00000000-0000-0000-0000-00000b17b001",
      section: sec1, bit: bmPdc, numBit: 1,
      depthIn: 800, depthOut: 980, footage: 180, rotatingHours: 22, tripHours: 8,
      wob: 18000, rpm: 120, torque: 6200, rop: 8.2, flowRate: 850, mudWeight: 9.6,
      reasonId: reasonTd?.id ?? null,
      dull: [1, 1, "WT", "A", "X", "I", "NO", "TD"],
    },
    {
      id: "00000000-0000-0000-0000-00000b17b002",
      section: sec1, bit: bmPdc, numBit: 2,
      depthIn: 980, depthOut: 1240, footage: 260, rotatingHours: 24, tripHours: 8.5,
      wob: 26000, rpm: 135, torque: 8100, rop: 14.5, flowRate: 880, mudWeight: 9.7,
      reasonId: reasonTd?.id ?? null,
      dull: [1, 2, "WT", "S", "X", "I", "NO", "TD"],
    },
    {
      id: "00000000-0000-0000-0000-00000b17b003",
      section: sec1, bit: bmPdc, numBit: 3,
      depthIn: 1240, depthOut: 1560, footage: 320, rotatingHours: 26, tripHours: 9,
      wob: 34000, rpm: 145, torque: 10200, rop: 21.0, flowRate: 900, mudWeight: 9.8,
      reasonId: reasonTd?.id ?? null,
      dull: [2, 3, "WT", "A", "X", "I", "NO", "TD"],
    },
    {
      id: "00000000-0000-0000-0000-00000b17b004",
      section: sec1, bit: bmPdc, numBit: 4,
      depthIn: 1560, depthOut: 1900, footage: 340, rotatingHours: 30, tripHours: 9,
      // founder: more WOB but ROP flattens / drops, torque climbs.
      wob: 42000, rpm: 150, torque: 12800, rop: 19.5, flowRate: 900, mudWeight: 9.9,
      reasonId: reasonTq?.id ?? null,
      dull: [3, 5, "BT", "A", "X", "2", "NO", "TQ"],
    },
    // 8-1/2" TCI — harder rock, slower ROP, a couple of runs.
    {
      id: "00000000-0000-0000-0000-00000b17b005",
      section: sec2, bit: bmTci, numBit: 5,
      depthIn: 1900, depthOut: 2080, footage: 180, rotatingHours: 35, tripHours: 11,
      wob: 30000, rpm: 90, torque: 5400, rop: 5.1, flowRate: 520, mudWeight: 10.4,
      reasonId: reasonTd?.id ?? null,
      dull: [2, 3, "BT", "A", "E", "I", "BU", "TD"],
    },
    {
      id: "00000000-0000-0000-0000-00000b17b006",
      section: sec2, bit: bmTci, numBit: 6,
      depthIn: 2080, depthOut: 2240, footage: 160, rotatingHours: 38, tripHours: 11.5,
      wob: 38000, rpm: 95, torque: 6300, rop: 4.2, flowRate: 540, mudWeight: 10.6,
      reasonId: reasonTd?.id ?? null,
      dull: [4, 6, "BT", "A", "E", "2", "WT", "TD"],
    },
    {
      id: "00000000-0000-0000-0000-00000b17b007",
      section: sec2, bit: bmTci, numBit: 7,
      depthIn: 2240, depthOut: 2420, footage: 180, rotatingHours: 33, tripHours: 12,
      wob: 24000, rpm: 100, torque: 4900, rop: 6.3, flowRate: 540, mudWeight: 10.6,
      reasonId: reasonTd?.id ?? null,
      dull: [3, 4, "WT", "A", "E", "I", "NO", "TD"],
    },
    {
      id: "00000000-0000-0000-0000-00000b17b008",
      section: sec2, bit: bmTci, numBit: 8,
      depthIn: 2420, depthOut: 2800, footage: 380, rotatingHours: 52, tripHours: 12.5,
      wob: 33000, rpm: 110, torque: 5800, rop: 7.0, flowRate: 560, mudWeight: 10.8,
      reasonId: reasonTd?.id ?? null,
      dull: [5, 7, "BT", "A", "E", "3", "BU", "TD"],
    },
  ];

  for (const r of runs) {
    await prisma.bitRun.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        clientId: clientA,
        wellboreId: wellbore.id,
        wellSectionId: r.section.id,
        bitMasterId: r.bit.id,
        numBit: r.numBit,
        depthIn: r.depthIn,
        depthOut: r.depthOut,
        footage: r.footage,
        rotatingHours: r.rotatingHours,
        tripHours: r.tripHours,
        wob: r.wob,
        rpm: r.rpm,
        torque: r.torque,
        rop: r.rop,
        flowRate: r.flowRate,
        mudWeight: r.mudWeight,
        reasonPulledId: r.reasonId,
        condFinalInner: r.dull[0],
        condFinalOuter: r.dull[1],
        condFinalDullChar: r.dull[2],
        condFinalLocation: r.dull[3],
        condFinalBearing: r.dull[4],
        condFinalGauge: r.dull[5],
        condFinalOther: r.dull[6],
        condFinalReason: r.dull[7],
      },
    });
  }
  console.log(`[seed] created ${runs.length} demo bit runs for tenant A.`);
}

async function main() {
  console.log("[seed] loading reference vocabulary…");
  await seedLookups();
  console.log("[seed] creating demo tenants…");
  const { CLIENT_A, CLIENT_B } = await seedDemoTenants();
  console.log("[seed] creating demo bit runs…");
  await seedDemoBitRuns(CLIENT_A);

  const counts = {
    contractors: await prisma.contractor.count(),
    holeSizes: await prisma.holeSize.count(),
    nozzleSizes: await prisma.nozzleSize.count(),
    mudTypes: await prisma.mudType.count(),
    reasonsPulled: await prisma.reasonPulled.count(),
    wellTypes: await prisma.wellType.count(),
    wellProfiles: await prisma.wellProfile.count(),
    dhMotorTypes: await prisma.dHMotorType.count(),
    activityTypes: await prisma.activityType.count(),
    formations: await prisma.formation.count(),
    lithologies: await prisma.lithology.count(),
    clients: await prisma.client.count(),
    wells: await prisma.well.count(),
    users: await prisma.user.count(),
    bitRuns: await prisma.bitRun.count(),
  };
  console.log("[seed] done:", counts);
  console.log(`[seed] demo tenants: A=${CLIENT_A} B=${CLIENT_B}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
