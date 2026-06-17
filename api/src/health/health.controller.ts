import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/roles.decorator';

export interface HealthStatus {
  status: 'ok';
  service: 'drilliq-api';
  time: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
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
