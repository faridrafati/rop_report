import { Module } from '@nestjs/common';

import { RopController } from './rop.controller';
import { RopService } from './rop.service';

@Module({
  controllers: [RopController],
  providers: [RopService],
})
export class RopModule {}
