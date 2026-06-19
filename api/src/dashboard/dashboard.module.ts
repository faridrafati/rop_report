import { Module } from '@nestjs/common';

import { RopModule } from '../rop/rop.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [RopModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
