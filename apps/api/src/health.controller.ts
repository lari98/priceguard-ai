import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class HealthController {
  @Get('healthz')
  @ApiExcludeEndpoint()
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
