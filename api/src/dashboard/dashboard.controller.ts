import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DashboardService, type DashboardKpis } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Management KPIs: cost/m, ROP, MSE, founder rate, NPT%, leaderboards (RLS-scoped).' })
  @ApiOkResponse({ description: 'Fleet KPI roll-up for the current tenant.' })
  kpis(): Promise<DashboardKpis> {
    return this.dashboard.kpis();
  }
}
