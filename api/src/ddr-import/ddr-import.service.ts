import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt.strategy';
import { pdfToLayoutText } from './pdf-text';
import { parseDdr, type ParsedDdr, type ParsedBit, type ParsedParameter } from './ddr-parser';

/** Result of a successful import — what was created/linked, plus the parse. */
export interface ImportResult {
  reportId: string;
  wellId: string;
  wellboreId: string;
  bitRunId: string | null;
  created: { activities: number; fluids: number; bitRun: boolean; well: boolean; wellbore: boolean };
  parsed: ParsedDdr;
}

function clip(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/** Roller-cone (TCI) vs fixed-cutter (PDC) from the IADC code / model shape. */
function inferBitFamily(bit: ParsedBit): 'TCI' | 'PDC' | 'OTHER' {
  const iadc = bit.iadc ?? '';
  const model = bit.model ?? '';
  if (/^[MSD]\d/.test(model) || /^[A-Za-z]/.test(iadc)) return 'PDC';
  if (/^\d{3,4}$/.test(iadc)) return 'TCI';
  return 'OTHER';
}

/** Representative drilling parameters for the run = the peak of each column. */
function aggregateParams(params: ParsedParameter[]) {
  const max = (pick: (p: ParsedParameter) => number | null) =>
    params.reduce<number | null>((m, p) => {
      const v = pick(p);
      return v == null ? m : m == null ? v : Math.max(m, v);
    }, null);
  return {
    wobLbf: max((p) => p.wobKlbf) != null ? max((p) => p.wobKlbf)! * 1000 : null,
    rpm: max((p) => p.rpm),
    torqueFtLbf: max((p) => p.torque) != null ? max((p) => p.torque)! * 1000 : null,
    flowGpm: max((p) => p.flowGpm),
    sppPsi: max((p) => p.sppPsi),
  };
}

const M_TO_FT = 3.280839895;

/**
 * Office-Engineer DDR PDF import. Parses the wellsite Daily Drilling Report PDF
 * and writes a DailyReport (+activities, +fluid) and a BitMaster/BitRun, all
 * inside the per-request RLS transaction so client_id is enforced by Postgres.
 * The well/wellbore are upserted by name under the importing user's tenant.
 */
@Injectable()
export class DdrImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Parse only — used by the preview step (no DB writes). */
  async parse(buffer: Buffer): Promise<ParsedDdr> {
    let text: string;
    try {
      text = await pdfToLayoutText(buffer);
    } catch {
      throw new BadRequestException('Could not read the PDF — the file may be corrupt or password-protected.');
    }
    const ddr = parseDdr(text);
    if (!ddr.reportDate && !ddr.ddrNo) {
      ddr.warnings.push('No DDR number or date found — this may not be a recognised Daily Drilling Report.');
    }
    return ddr;
  }

  /** Parse + persist. Throws if the same well/date DDR was already imported. */
  async import(user: JwtUser, buffer: Buffer, fileName: string): Promise<ImportResult> {
    const ddr = await this.parse(buffer);
    if (!ddr.reportDate) {
      throw new BadRequestException(
        'Could not read a report date from the PDF; refusing to import an unrecognised document.',
      );
    }
    const wellName =
      ddr.wellName ??
      (fileName.match(/\b([A-Z]{2,}\d[\w-]+)\b/)?.[1] ?? null) ??
      'IMPORTED-WELL';

    return this.prisma.tenant(async (db) => {
      const createdWell = { value: false };
      const createdWellbore = { value: false };

      // ── Well (upsert by name within the tenant) ────────────────
      let well = await db.well.findFirst({ where: { name: wellName } });
      if (!well) {
        well = await db.well.create({
          data: {
            clientId: user.clientId,
            name: wellName,
            field: ddr.fieldName ?? null,
            status: 'DRILLING',
            spudDate: ddr.spudDate ? new Date(ddr.spudDate) : null,
          },
        });
        createdWell.value = true;
      }

      // ── Wellbore (default original hole "OH") ──────────────────
      let wellbore = await db.wellbore.findFirst({ where: { wellId: well.id } });
      if (!wellbore) {
        wellbore = await db.wellbore.create({
          data: { clientId: user.clientId, wellId: well.id, name: 'OH' },
        });
        createdWellbore.value = true;
      }

      // ── Duplicate guard ────────────────────────────────────────
      const dupe = await db.dailyReport.findFirst({
        where: { wellboreId: wellbore.id, reportDate: new Date(ddr.reportDate!) },
      });
      if (dupe) {
        throw new ConflictException(
          `A DDR for ${wellName} dated ${ddr.reportDate} is already imported.`,
        );
      }

      // ── Mud type lookup (best-effort match by leading token) ───
      let mudTypeId: string | null = null;
      if (ddr.fluid?.type) {
        const token = ddr.fluid.type.split(/[\s/]/)[0];
        if (token) {
          const mt = await db.mudType.findFirst({
            where: { name: { contains: token, mode: 'insensitive' } },
          });
          mudTypeId = mt?.id ?? null;
        }
      }

      // ── DailyReport + activities + fluid ───────────────────────
      const statusInfo = [
        ddr.operationsSummary,
        ddr.operationsNextPeriod ? `Next: ${ddr.operationsNextPeriod}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      const incidents = [ddr.hazards, ddr.generalNotes].filter(Boolean).join('\n\n');

      const report = await db.dailyReport.create({
        data: {
          clientId: user.clientId,
          wellboreId: wellbore.id,
          reportDate: new Date(ddr.reportDate!),
          reportNo: ddr.ddrNo != null ? Math.round(ddr.ddrNo) : null,
          depthStartMd: ddr.startDepthMd,
          depthEndMd: ddr.endDepthMd,
          statusInfo: clip(statusInfo, 4000),
          presentOperation: clip(ddr.operationsAtReportTime, 2000),
          personnelCount: ddr.headCount,
          incidents: clip(incidents, 4000),
          activities: {
            create: ddr.activities.map((a) => ({
              clientId: user.clientId,
              iadcOpCode: a.code1,
              durationHr: a.durationHr,
              classification: 'PLANNED' as const,
              isProductive: a.isProductive,
              nptCategory: a.isProductive ? null : 'rig',
              description: clip(a.description, 2000),
            })),
          },
          fluids: ddr.fluid
            ? {
                create: [
                  {
                    clientId: user.clientId,
                    mudTypeId,
                    checkDepthMd: ddr.fluid.checkDepthMd,
                    mw: ddr.fluid.densityPpg,
                    ph: ddr.fluid.ph,
                    funnelVisc: ddr.fluid.funnelVisc,
                  },
                ],
              }
            : undefined,
        },
        include: { activities: true, fluids: true },
      });

      // ── BitMaster (catalogue) + BitRun (deployment) ────────────
      let bitRunId: string | null = null;
      if (ddr.bit?.model) {
        let bm = await db.bitMaster.findFirst({
          where: { manufacturer: ddr.bit.make ?? 'UNKNOWN', typeBit: ddr.bit.model },
        });
        if (!bm) {
          bm = await db.bitMaster.create({
            data: {
              clientId: user.clientId,
              serialNo: ddr.bit.serial,
              manufacturer: ddr.bit.make ?? 'UNKNOWN',
              typeBit: ddr.bit.model,
              bitFamily: inferBitFamily(ddr.bit),
              diaBit: ddr.bit.sizeIn ?? 0,
              codeIadc: ddr.bit.iadc,
              tfa: ddr.bit.tfaIn2,
            },
          });
        }
        const agg = aggregateParams(ddr.parameters);
        const depthIn = ddr.bit.depthInMd ?? ddr.startDepthMd;
        const depthOut = ddr.endDepthMd;
        const footage =
          depthIn != null && depthOut != null ? Number((depthOut - depthIn).toFixed(2)) : null;
        const run = await db.bitRun.create({
          data: {
            clientId: user.clientId,
            wellboreId: wellbore.id,
            bitMasterId: bm.id,
            numBit: null,
            depthIn,
            depthOut,
            footage,
            wob: agg.wobLbf,
            rpm: agg.rpm,
            torque: agg.torqueFtLbf,
            rop: ddr.avgRopMhr != null ? Number((ddr.avgRopMhr * M_TO_FT).toFixed(4)) : null,
            flowRate: agg.flowGpm,
            mudWeight: ddr.fluid?.densityPpg ?? ddr.lastMudDensityPpg,
            pBit: agg.sppPsi,
            bitClass: 'U',
          },
        });
        bitRunId = run.id;
      }

      // ── Audit ──────────────────────────────────────────────────
      await db.auditLog.create({
        data: {
          clientId: user.clientId,
          actorUserId: user.userId,
          action: 'CREATE',
          entityType: 'DailyReport',
          entityId: report.id,
          diff: { source: 'pdf-import', fileName, ddrNo: ddr.ddrNo } as Prisma.InputJsonValue,
        },
      });

      return {
        reportId: report.id,
        wellId: well.id,
        wellboreId: wellbore.id,
        bitRunId,
        created: {
          activities: report.activities.length,
          fluids: report.fluids.length,
          bitRun: bitRunId != null,
          well: createdWell.value,
          wellbore: createdWellbore.value,
        },
        parsed: ddr,
      };
    });
  }
}
