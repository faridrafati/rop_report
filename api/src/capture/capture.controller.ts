import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CaptureService } from './capture.service';

@ApiTags('capture')
@ApiBearerAuth()
@Controller('capture')
export class CaptureController {
  constructor(private readonly capture: CaptureService) {}

  @Get('refs')
  @ApiOperation({ summary: 'Reference data for capture forms (wellbores, sections, bit masters, lookups).' })
  refs() {
    return this.capture.refs();
  }
}
