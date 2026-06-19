import { Module } from '@nestjs/common';

import { IntegrationsController } from './integrations.controller';
import { WitsmlService } from './witsml.service';
import { ErpConnectorService } from './erp.service';

@Module({
  controllers: [IntegrationsController],
  providers: [WitsmlService, ErpConnectorService],
})
export class IntegrationsModule {}
