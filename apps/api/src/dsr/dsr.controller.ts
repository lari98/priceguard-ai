import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ErasureService } from './erasure.service';
import { DsarExportService } from './export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentAuthContext, CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { AuthContext } from '../common/request-context';

@ApiTags('dsr')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dsr/end-accounts')
export class DsrController {
  constructor(
    private readonly erasureService: ErasureService,
    private readonly dsarExportService: DsarExportService,
  ) {}

  @Delete(':id')
  @Roles('ADMIN')
  async erase(@CurrentTenant() tenantId: string, @CurrentAuthContext() authContext: AuthContext, @Param('id') endAccountId: string) {
    return this.erasureService.eraseEndAccount(tenantId, endAccountId, authContext.actorId);
  }

  /** Phase 6 DSAR self-service export — the "right to access/portability" complement to erasure above. */
  @Get(':id/export')
  @Roles('ADMIN', 'ANALYST')
  @UseGuards(PermissionsGuard)
  @RequirePermission('accounts:export')
  async export(@CurrentTenant() tenantId: string, @CurrentAuthContext() authContext: AuthContext, @Param('id') endAccountId: string) {
    return this.dsarExportService.exportEndAccount(tenantId, endAccountId, authContext.actorId);
  }
}
