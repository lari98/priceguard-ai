import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { InvestigationsService } from './investigations.service';
import { SubmitAppealDto } from './dto/submit-appeal.dto';
import { DecideAppealDto } from './dto/decide-appeal.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentAuthContext, CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { AuthContext } from '../common/request-context';

@ApiTags('appeals')
@Controller('appeals')
export class AppealsController {
  constructor(private readonly investigationsService: InvestigationsService) {}

  /** Dashboard review queue. JWT-authenticated (analysts/admins), distinct from the
   *  API-key-authenticated `submit` below (called by the tenant's own backend on
   *  behalf of its end customer). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ANALYST', 'VIEWER')
  @Get()
  async list(@CurrentTenant() tenantId: string) {
    return this.investigationsService.listAppealsForTenant(tenantId);
  }

  /** Submitted by the tenant's own application on behalf of its end customer — hence
   *  API-key auth, not dashboard JWT auth (the end customer never talks to PriceGuard
   *  directly, per docs/PHASE_0_DISCOVERY.md persona 5). */
  @ApiSecurity('ApiKeyAuth')
  @UseGuards(ApiKeyGuard)
  @Post()
  async submit(@CurrentTenant() tenantId: string, @Body() dto: SubmitAppealDto) {
    return this.investigationsService.submitAppeal(tenantId, dto.investigationId, dto.submittedByExternalId, dto.message);
  }

  // Phase 6: fine-grained permission ('appeals:decide') instead of a fixed role list — a
  // tenant ADMIN can grant or revoke this independently of the ADMIN/ANALYST/VIEWER role
  // itself via POST /rbac/overrides. RolesGuard('ADMIN','ANALYST') is kept as a coarse
  // floor (VIEWER can never decide appeals, override or not) with PermissionsGuard adding
  // the actual fine-grained check on top.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN', 'ANALYST')
  @RequirePermission('appeals:decide')
  @Post(':id/decision')
  async decide(
    @CurrentTenant() tenantId: string,
    @CurrentAuthContext() authContext: AuthContext,
    @Param('id') appealId: string,
    @Body() dto: DecideAppealDto,
  ) {
    return this.investigationsService.decideAppeal(tenantId, appealId, dto.outcome, dto.notes, authContext.actorId);
  }
}
