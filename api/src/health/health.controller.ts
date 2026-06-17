import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export interface HealthStatus {
  status: 'ok';
  service: 'drilliq-api';
  time: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Service is up.' })
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'drilliq-api',
      time: new Date().toISOString(),
    };
  }
}
