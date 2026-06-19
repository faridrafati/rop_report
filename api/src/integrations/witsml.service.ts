import { Injectable } from '@nestjs/common';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt.strategy';

const dec = (v: Prisma.Decimal | number | null | undefined): number | '' =>
  v == null ? '' : typeof v === 'number' ? v : v.toNumber();

export interface WitsmlCounts {
  wells: number;
  wellbores: number;
  bitRecords: number;
}

/**
 * WITSML 1.4.1.1-aligned import/export (Phase 8). Export emits the
 * well → wellbore → bitRecord (with condFinal dull grade) hierarchy for the
 * caller's tenant. Import parses that document and upserts by `uid` inside the
 * RLS transaction, so it is idempotent and cannot write across the tenant
 * boundary (WITH CHECK). Round-trip safe: export → import → export is lossless.
 *
 * (Full reconstruction of foreign WITSML — creating new wells/bit masters from
 * an external document — is a later ETL; this round-trips DrillIQ's own data.)
 */
@Injectable()
export class WitsmlService {
  constructor(private readonly prisma: PrismaService) {}

  async exportXml(): Promise<string> {
    const wells = await this.prisma.tenant((db) =>
      db.well.findMany({
        orderBy: { name: 'asc' },
        include: {
          wellbores: {
            orderBy: { name: 'asc' },
            include: { bitRuns: { orderBy: { createdAt: 'asc' }, include: { bitMaster: true } } },
          },
        },
      }),
    );

    const doc = {
      wells: {
        '@_xmlns': 'http://www.witsml.org/schemas/1series',
        '@_version': '1.4.1.1',
        well: wells.map((w) => ({
          '@_uid': w.id,
          name: w.name,
          field: w.field ?? '',
          wellbore: w.wellbores.map((wb) => ({
            '@_uid': wb.id,
            name: wb.name,
            bitRecord: wb.bitRuns.map((r) => ({
              '@_uid': r.id,
              numBit: r.numBit ?? '',
              diaBit: dec(r.bitMaster?.diaBit),
              codeIADC: r.bitMaster?.codeIadc ?? '',
              typeBit: r.bitMaster?.typeBit ?? '',
              dia: dec(r.depthIn),
              depthIn: dec(r.depthIn),
              depthOut: dec(r.depthOut),
              condFinalInner: r.condFinalInner ?? '',
              condFinalOuter: r.condFinalOuter ?? '',
              condFinalDullChar: r.condFinalDullChar ?? '',
              condFinalReason: r.condFinalReason ?? '',
            })),
          })),
        })),
      },
    };

    return new XMLBuilder({ ignoreAttributes: false, format: true }).build(doc);
  }

  async importXml(_user: JwtUser, xml: string): Promise<WitsmlCounts> {
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml);
    const arr = <T,>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);
    const wellNodes = arr<Record<string, unknown>>(parsed?.wells?.well as never);

    const counts: WitsmlCounts = { wells: 0, wellbores: 0, bitRecords: 0 };
    await this.prisma.tenant(async (db) => {
      for (const w of wellNodes) {
        const wellId = String(w['@_uid'] ?? '');
        if (!wellId) continue;
        const existing = await db.well.findUnique({ where: { id: wellId } });
        if (existing) {
          await db.well.update({ where: { id: wellId }, data: { name: String(w.name ?? existing.name), field: (w.field as string) || existing.field } });
          counts.wells++;
        }
        for (const wb of arr<Record<string, unknown>>(w.wellbore as never)) {
          const wbId = String(wb['@_uid'] ?? '');
          if (!wbId) continue;
          const wbRow = await db.wellbore.findUnique({ where: { id: wbId } });
          if (wbRow) {
            await db.wellbore.update({ where: { id: wbId }, data: { name: String(wb.name ?? wbRow.name) } });
            counts.wellbores++;
          }
          for (const br of arr<Record<string, unknown>>(wb.bitRecord as never)) {
            const brId = String(br['@_uid'] ?? '');
            if (!brId) continue;
            const run = await db.bitRun.findUnique({ where: { id: brId } });
            if (run) {
              await db.bitRun.update({
                where: { id: brId },
                data: {
                  condFinalInner: br.condFinalInner === '' || br.condFinalInner == null ? run.condFinalInner : Number(br.condFinalInner),
                  condFinalDullChar: (br.condFinalDullChar as string) || run.condFinalDullChar,
                  condFinalReason: (br.condFinalReason as string) || run.condFinalReason,
                },
              });
              counts.bitRecords++;
            }
          }
        }
      }
    });
    return counts;
  }
}
