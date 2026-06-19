import { Module } from '@nestjs/common';

import { CaptureService } from './capture.service';
import { BitRunsController } from './bit-runs.controller';
import { DailyReportsController } from './daily-reports.controller';
import { CaptureController } from './capture.controller';

@Module({
  controllers: [BitRunsController, DailyReportsController, CaptureController],
  providers: [CaptureService],
})
export class CaptureModule {}
