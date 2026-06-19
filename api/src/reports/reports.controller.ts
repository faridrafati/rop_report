import { Controller, Get, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/** Minimal structural type for the express response (avoids a direct express types dep). */
interface Response {
  set(headers: Record<string, string>): unknown;
  send(body: Buffer): unknown;
}

import { ReportsService } from './reports.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('bit-runs.xlsx')
  @ApiOperation({ summary: 'Excel export of bit runs (RLS-scoped to your client; audited).' })
  async bitRunsXlsx(@CurrentUser() user: JwtUser, @Res() res: Response): Promise<void> {
    const { buf, count } = await this.reports.bitRunsWorkbook(user);
    res.set({ 'Content-Type': XLSX, 'Content-Disposition': 'attachment; filename="drilliq-bit-runs.xlsx"', 'X-Report-Rows': String(count) });
    res.send(buf);
  }

  @Get('bit-runs.pdf')
  @ApiOperation({ summary: 'PDF bit-run report (RLS-scoped; audited).' })
  async bitRunsPdf(@CurrentUser() user: JwtUser, @Res() res: Response): Promise<void> {
    const { buf, count } = await this.reports.bitRunsPdf(user);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="drilliq-bit-runs.pdf"', 'X-Report-Rows': String(count) });
    res.send(buf);
  }

  @Get('daily-reports.xlsx')
  @ApiOperation({ summary: 'Excel export of DDR activities with NPT classification (RLS-scoped; audited).' })
  async ddrXlsx(@CurrentUser() user: JwtUser, @Res() res: Response): Promise<void> {
    const { buf, count } = await this.reports.dailyReportsWorkbook(user);
    res.set({ 'Content-Type': XLSX, 'Content-Disposition': 'attachment; filename="drilliq-daily-reports.xlsx"', 'X-Report-Rows': String(count) });
    res.send(buf);
  }
}
