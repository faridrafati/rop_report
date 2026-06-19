import { Module } from '@nestjs/common';

import { DdrImportService } from './ddr-import.service';
import { DdrImportController } from './ddr-import.controller';

@Module({
  controllers: [DdrImportController],
  providers: [DdrImportService],
})
export class DdrImportModule {}
