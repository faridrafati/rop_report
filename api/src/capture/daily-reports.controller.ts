import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateDailyReportSchema } from '@drilliq/shared';

import { CaptureService } from './capture.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';

@ApiTags('capture')
@ApiBearerAuth()
@Controller('daily-reports')
export class DailyReportsController {
  constructor(private readonly capture: CaptureService) {}

  @Post()
  @HttpCode(201)
  @Roles('OPERATION_ENGINEER')
  @ApiOperation({ summary: 'Capture a DDR (status, activities→NPT, fluids, costs, personnel, incidents).' })
  @ApiOkResponse({ description: 'The created daily report with nested activities + fluids.' })
  async create(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const parsed = CreateDailyReportSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.capture.createDailyReport(user, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: 'List daily reports for the current tenant (RLS-scoped).' })
  list(@CurrentUser() user: JwtUser) {
    return this.capture.listDailyReports(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a daily report with activities + fluids (RLS-scoped).' })
  getOne(@Param('id') id: string) {
    return this.capture.getDailyReport(id);
  }
}
