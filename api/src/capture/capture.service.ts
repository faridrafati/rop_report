import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateBitRunInput,
  CreateDailyReportInput,
  DullGrade,
} from '@drilliq/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt.strategy';

/** Map a shared DullGrade object onto the BitRun condFinal* columns. */
function condFinal(g?: DullGrade | null) {
  return {
    condFinalInner: g?.inner ?? null,
    condFinalOuter: g?.outer ?? null,
    condFinalDullChar: g?.dullChar ?? null,
    condFinalLocation: g?.location ?? null,
    condFinalBearing: g?.bearing ?? null,
    condFinalGauge: g?.gauge ?? null,
    condFinalOther: g?.other ?? null,
    condFinalReason: g?.reason ?? null,
  };
}

/** Map a shared DullGrade object onto the BitRun condInit* columns. */
function condInit(g?: DullGrade | null) {
  return {
    condInitInner: g?.inner ?? null,
    condInitOuter: g?.outer ?? null,
    condInitDullChar: g?.dullChar ?? null,
    condInitLocation: g?.location ?? null,
    condInitBearing: g?.bearing ?? null,
    condInitGauge: g?.gauge ?? null,
    condInitOther: g?.other ?? null,
    condInitReason: g?.reason ?? null,
  };
}

/**
 * Operation-Engineer capture service. Every write runs inside the per-request
 * RLS transaction (prisma.tenant) so client_id is enforced by the database, and
 * every write is recorded to the client-scoped AuditLog.
 */
@Injectable()
export class CaptureService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(
    db: Prisma.TransactionClient,
    user: JwtUser,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    entityType: string,
    entityId: string,
    diff: unknown,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        clientId: user.clientId,
        actorUserId: user.userId,
        action,
        entityType,
        entityId,
        diff: diff as Prisma.InputJsonValue,
      },
    });
  }

  // ── Bit runs ────────────────────────────────────────────────────
  async createBitRun(user: JwtUser, input: CreateBitRunInput) {
    return this.prisma.tenant(async (db) => {
      const run = await db.bitRun.create({
        data: {
          clientId: user.clientId,
          wellboreId: input.wellboreId,
          wellSectionId: input.wellSectionId ?? null,
          bitMasterId: input.bitMasterId,
          numBit: input.numBit ?? null,
          depthIn: input.depthIn ?? null,
          depthOut: input.depthOut ?? null,
          footage: input.footage ?? null,
          rotatingHours: input.rotatingHours ?? null,
          tripHours: input.tripHours ?? null,
          wob: input.wob ?? null,
          rpm: input.rpm ?? null,
          torque: input.torque ?? null,
          rop: input.rop ?? null,
          flowRate: input.flowRate ?? null,
          mudWeight: input.mudWeight ?? null,
          reasonPulledId: input.reasonPulledId ?? null,
          dhMotorTypeId: input.dhMotorTypeId ?? null,
          bitClass: input.bitClass ?? null,
          stickSlip: input.dysfunction?.stickSlip ?? null,
          whirl: input.dysfunction?.whirl ?? null,
          bitBounce: input.dysfunction?.bitBounce ?? null,
          bitBalling: input.dysfunction?.bitBalling ?? null,
          ...condFinal(input.condFinal),
          ...condInit(input.condInit),
        },
      });
      await this.audit(db, user, 'CREATE', 'BitRun', run.id, input);
      return run;
    });
  }

  async listBitRuns(_user: JwtUser) {
    return this.prisma.tenant((db) =>
      db.bitRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { bitMaster: true, reasonPulled: true },
      }),
    );
  }

  async getBitRun(id: string) {
    const run = await this.prisma.tenant((db) =>
      db.bitRun.findUnique({
        where: { id },
        include: { bitMaster: true, reasonPulled: true, nozzles: true },
      }),
    );
    if (!run) throw new NotFoundException('Bit run not found');
    return run;
  }

  // ── Daily reports (DDR) ─────────────────────────────────────────
  async createDailyReport(user: JwtUser, input: CreateDailyReportInput) {
    return this.prisma.tenant(async (db) => {
      const report = await db.dailyReport.create({
        data: {
          clientId: user.clientId,
          wellboreId: input.wellboreId,
          reportDate: new Date(input.reportDate),
          reportNo: input.reportNo ?? null,
          depthStartMd: input.depthStartMd ?? null,
          depthEndMd: input.depthEndMd ?? null,
          statusInfo: input.statusInfo ?? null,
          presentOperation: input.presentOperation ?? null,
          dayCost: input.dayCost ?? null,
          cumCost: input.cumCost ?? null,
          personnelCount: input.personnelCount ?? null,
          incidents: input.incidents ?? null,
          activities: {
            create: input.activities.map((a) => ({
              clientId: user.clientId,
              activityTypeId: a.activityTypeId ?? null,
              iadcOpCode: a.iadcOpCode ?? null,
              startTime: a.startTime ? new Date(a.startTime) : null,
              endTime: a.endTime ? new Date(a.endTime) : null,
              durationHr: a.durationHr ?? null,
              depthMd: a.depthMd ?? null,
              classification: a.classification,
              isProductive: a.isProductive,
              nptCategory: a.nptCategory ?? null,
              description: a.description ?? null,
            })),
          },
          fluids: {
            create: input.fluids.map((f) => ({
              clientId: user.clientId,
              mudTypeId: f.mudTypeId ?? null,
              checkDepthMd: f.checkDepthMd ?? null,
              mw: f.mw ?? null,
              pv: f.pv ?? null,
              yp: f.yp ?? null,
              gel10s: f.gel10s ?? null,
              gel10m: f.gel10m ?? null,
              ph: f.ph ?? null,
              ecd: f.ecd ?? null,
              funnelVisc: f.funnelVisc ?? null,
              solidsPct: f.solidsPct ?? null,
            })),
          },
        },
        include: { activities: true, fluids: true },
      });
      await this.audit(db, user, 'CREATE', 'DailyReport', report.id, input);
      return report;
    });
  }

  async listDailyReports(_user: JwtUser) {
    return this.prisma.tenant((db) =>
      db.dailyReport.findMany({
        orderBy: { reportDate: 'desc' },
        take: 200,
        include: { _count: { select: { activities: true, fluids: true } } },
      }),
    );
  }

  async getDailyReport(id: string) {
    const report = await this.prisma.tenant((db) =>
      db.dailyReport.findUnique({
        where: { id },
        include: { activities: true, fluids: true },
      }),
    );
    if (!report) throw new NotFoundException('Daily report not found');
    return report;
  }

  // ── Form reference data (selectors) ─────────────────────────────
  async refs() {
    return this.prisma.tenant(async (db) => {
      const [wellbores, sections, bitMasters, reasonsPulled, activityTypes, mudTypes] =
        await Promise.all([
          db.wellbore.findMany({
            select: { id: true, name: true, well: { select: { name: true } } },
            orderBy: { name: 'asc' },
          }),
          db.wellSection.findMany({
            select: { id: true, seq: true, wellboreId: true, holeSize: { select: { label: true } } },
            orderBy: { seq: 'asc' },
          }),
          db.bitMaster.findMany({
            select: { id: true, manufacturer: true, typeBit: true, diaBit: true, codeIadc: true },
            orderBy: { typeBit: 'asc' },
          }),
          db.reasonPulled.findMany({ select: { id: true, code: true, description: true }, orderBy: { code: 'asc' } }),
          db.activityType.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
          db.mudType.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        ]);
      return { wellbores, sections, bitMasters, reasonsPulled, activityTypes, mudTypes };
    });
  }
}
