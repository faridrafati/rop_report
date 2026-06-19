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
import { CreateBitRunSchema } from '@drilliq/shared';

import { CaptureService } from './capture.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';

@ApiTags('capture')
@ApiBearerAuth()
@Controller('bit-runs')
export class BitRunsController {
  constructor(private readonly capture: CaptureService) {}

  @Post()
  @HttpCode(201)
  @Roles('OPERATION_ENGINEER')
  @ApiOperation({ summary: 'Capture a bit run (parameters, 8-position dull grade init+final, dysfunction flags).' })
  @ApiOkResponse({ description: 'The created bit run.' })
  async create(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const parsed = CreateBitRunSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.capture.createBitRun(user, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: 'List bit runs for the current tenant (RLS-scoped).' })
  list(@CurrentUser() user: JwtUser) {
    return this.capture.listBitRuns(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a bit run by id (RLS-scoped; 404 if not in tenant).' })
  getOne(@Param('id') id: string) {
    return this.capture.getBitRun(id);
  }
}
