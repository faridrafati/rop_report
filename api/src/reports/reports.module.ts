import { Module } from '@nestjs/common';

import { RopModule } from '../rop/rop.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [RopModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
