import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RiskService } from './risk.service';
import { RiskEventInputDto } from './dto/risk-event-input.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { CurrentAuthContext, CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { AuthContext } from '../common/request-context';

@ApiTags('risk')
@ApiSecurity('ApiKeyAuth')
@UseGuards(ApiKeyGuard)
@Controller('v1/risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Post('events')
  @Throttle({ default: { limit: 100, ttl: 60_000 } })
  async createEvent(@CurrentTenant() tenantId: string, @CurrentAuthContext() authContext: AuthContext, @Body() dto: RiskEventInputDto) {
    return this.riskService.ingest(tenantId, authContext.actorId, dto);
  }
}
