import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';
import { costPerFoot } from '@drilliq/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RopService } from '../rop/rop.service';
import type { JwtUser } from '../auth/jwt.strategy';

const f1 = (v: number | null) => (v == null ? '' : Math.round(v * 100) / 100);

/**
 * Server-side report generation. Excel via ExcelJS, PDF via pdfkit (built-in
 * Helvetica — no headless Chromium needed). All data comes from RopService /
 * Prisma under the per-request RLS tenant scope, so a Contractor export can only
 * ever contain their own client's rows. Every download is audited.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly rop: RopService,
    private readonly prisma: PrismaService,
  ) {}

  private async audit(user: JwtUser, format: string, count: number): Promise<void> {
    await this.prisma.tenant((db) =>
      db.auditLog.create({
        data: {
          clientId: user.clientId,
          actorUserId: user.userId,
          action: 'CREATE',
          entityType: 'Export',
          diff: { format, count } as Prisma.InputJsonValue,
        },
      }),
    );
  }

  /** Bit-run workbook: a data sheet + a Reference sheet carrying the canonical $48.8/ft fixture. */
  async bitRunsWorkbook(user: JwtUser): Promise<{ buf: Buffer; count: number }> {
    const { points } = await this.rop.getRopOptimization({});
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DrillIQ';
    const ws = wb.addWorksheet('Bit runs');
    ws.columns = [
      { header: 'Well', key: 'well', width: 16 },
      { header: 'Make', key: 'make', width: 14 },
      { header: 'IADC', key: 'iadc', width: 10 },
      { header: 'Bit size', key: 'size', width: 10 },
      { header: 'Depth in (m)', key: 'din', width: 12 },
      { header: 'Depth out (m)', key: 'dout', width: 12 },
      { header: 'Footage (m)', key: 'm', width: 12 },
      { header: 'ROP (ft/hr)', key: 'rop', width: 12 },
      { header: 'MSE (psi)', key: 'mse', width: 12 },
      { header: 'HSI', key: 'hsi', width: 8 },
      { header: 'Cost/m ($)', key: 'cost', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of points) {
      ws.addRow({
        well: p.wellName, make: p.make ?? '', iadc: p.iadc ?? '', size: p.bitSize ?? '',
        din: f1(p.depthIn), dout: f1(p.depthOut), m: f1(p.meters), rop: f1(p.ropFthr),
        mse: p.mse == null ? '' : Math.round(p.mse), hsi: f1(p.hsi), cost: f1(p.costPerMeter),
      });
    }
    const ref = wb.addWorksheet('Reference');
    ref.addRow(['Canonical cost-per-foot fixture']);
    ref.addRow(['Inputs', 'B=27000, R=3500, t=50, T=12, F=5000']);
    ref.addRow(['Cost per foot ($/ft)', costPerFoot(27000, 3500, 50, 12, 5000)]);
    ref.getRow(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    await this.audit(user, 'xlsx:bit-runs', points.length);
    return { buf: Buffer.from(buf), count: points.length };
  }

  /** Daily-report workbook with the NPT classification per activity. */
  async dailyReportsWorkbook(user: JwtUser): Promise<{ buf: Buffer; count: number }> {
    const reports = await this.prisma.tenant((db) =>
      db.dailyReport.findMany({
        orderBy: { reportDate: 'desc' },
        take: 1000,
        include: { wellbore: { include: { well: true } }, activities: true },
      }),
    );
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DrillIQ';
    const ws = wb.addWorksheet('DDR activities');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Well', key: 'well', width: 16 },
      { header: 'Classification', key: 'cls', width: 14 },
      { header: 'Productive', key: 'prod', width: 10 },
      { header: 'NPT', key: 'npt', width: 6 },
      { header: 'Hours', key: 'hr', width: 8 },
      { header: 'Description', key: 'desc', width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    let count = 0;
    for (const r of reports) {
      for (const a of r.activities) {
        const npt = !a.isProductive && (a.classification === 'UNPLANNED' || a.classification === 'DOWNTIME');
        ws.addRow({
          date: r.reportDate.toISOString().slice(0, 10),
          well: r.wellbore.well.name,
          cls: a.classification,
          prod: a.isProductive ? 'Yes' : 'No',
          npt: npt ? 'NPT' : '',
          hr: a.durationHr ? Number(a.durationHr) : '',
          desc: a.description ?? '',
        });
        count++;
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    await this.audit(user, 'xlsx:daily-reports', count);
    return { buf: Buffer.from(buf), count };
  }

  /** Bit-run PDF summary (pdfkit, built-in fonts). */
  async bitRunsPdf(user: JwtUser): Promise<{ buf: Buffer; count: number }> {
    const { points } = await this.rop.getRopOptimization({});
    // compress:false keeps text in the content stream as plain bytes (so the
    // RLS-scoped run count is verifiable in tests).
    const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.fontSize(18).fillColor('#1e293b').text('DrillIQ — Bit-run report');
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor('#64748b').text(`Generated ${new Date().toISOString()} · ${points.length} bit runs (your client only)`);
    doc.moveDown(1);

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const costs = points.map((p) => p.costPerMeter).filter((x): x is number => x != null);
    const rops = points.map((p) => p.ropFthr).filter((x): x is number => x != null);
    doc.fontSize(11).fillColor('#0f172a');
    doc.text(`Avg cost/m: $${avg(costs).toFixed(2)}    Avg ROP: ${avg(rops).toFixed(1)} ft/hr`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#1e293b').text('Top runs by ROP');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#0f172a');
    const top = [...points].filter((p) => p.ropFthr != null).sort((a, b) => (b.ropFthr ?? 0) - (a.ropFthr ?? 0)).slice(0, 25);
    for (const p of top) {
      doc.text(`${p.wellName}  ·  ${[p.make, p.iadc].filter(Boolean).join(' ')}  ·  ROP ${f1(p.ropFthr)} ft/hr  ·  MSE ${p.mse == null ? '—' : Math.round(p.mse)} psi  ·  cost/m $${f1(p.costPerMeter)}`);
    }
    if (top.length === 0) doc.fillColor('#94a3b8').text('No qualifying bit runs.');

    doc.end();
    const out = await done;
    await this.audit(user, 'pdf:bit-runs', points.length);
    return { buf: out, count: points.length };
  }
}
