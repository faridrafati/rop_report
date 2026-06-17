import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.service';
import { RopController } from './rop.controller';
import { RopService } from './rop.service';

@Module({
  imports: [PrismaModule],
  controllers: [RopController],
  providers: [RopService],
})
export class RopModule {}
