import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RiskService } from './risk.service';
import { RiskEventInputDto } from './dto/risk-event-input.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { CurrentAuthContext, CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { AuthContext } from '../common/request-context';

// Phase 8 (Scale): tunable per-deployment without a code change/redeploy, so a replica
// serving a high-volume tenant can be sized differently from the platform default. Note
// (see docs/adr/0010-scale-phase8-scope.md): @nestjs/throttler's default in-memory storage
// means this limit is enforced PER REPLICA, not cluster-wide — a real gap for horizontal
// scaling, documented rather than silently assumed away.
const RISK_INGESTION_RATE_LIMIT = Number(process.env.RISK_INGESTION_RATE_LIMIT ?? 100);

@ApiTags('risk')
@ApiSecurity('ApiKeyAuth')
@UseGuards(ApiKeyGuard)
@Controller('v1/risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Post('events')
  @Throttle({ default: { limit: RISK_INGESTION_RATE_LIMIT, ttl: 60_000 } })
  async createEvent(@CurrentTenant() tenantId: string, @CurrentAuthContext() authContext: AuthContext, @Body() dto: RiskEventInputDto) {
    return this.riskService.ingest(tenantId, authContext.actorId, dto);
  }
}
