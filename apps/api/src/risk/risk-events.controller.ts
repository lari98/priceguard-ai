import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RiskService } from './risk.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

/**
 * Dashboard-facing read endpoint, distinct from RiskController (API-key authenticated
 * ingestion). Lives in its own file/route (`/risk-events`, plural, past-tense-flavoured
 * to distinguish from the `/v1/risk/events` ingestion path) rather than being bolted
 * onto RiskController, so the two very different auth models are never mixed in one
 * `@UseGuards` list.
 */
@ApiTags('risk-events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('risk-events')
export class RiskEventsController {
  constructor(private readonly riskService: RiskService) {}

  @Get()
  async list(@CurrentTenant() tenantId: string) {
    return this.riskService.listRecentEvents(tenantId);
  }
}
