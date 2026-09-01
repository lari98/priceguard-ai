import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('me')
  async me(@CurrentTenant() tenantId: string) {
    return this.tenantService.findById(tenantId);
  }

  /**
   * Phase 9 (Production Hardening): API-key self-service management, ADMIN-only — see
   * docs/security/INCIDENT_RESPONSE.md for the runbook this exists to support (rotating or
   * revoking a compromised key without needing direct database access).
   */
  @Get('api-keys')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @RequirePermission('api-keys:manage')
  async listApiKeys(@CurrentTenant() tenantId: string) {
    return this.tenantService.listApiKeys(tenantId);
  }

  /** Returns the plaintext secret exactly once, in this response only. */
  @Post('api-keys')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @RequirePermission('api-keys:manage')
  async createApiKey(@CurrentTenant() tenantId: string) {
    return this.tenantService.createApiKey(tenantId);
  }

  @Post('api-keys/:keyPrefix/revoke')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @RequirePermission('api-keys:manage')
  async revokeApiKey(@CurrentTenant() tenantId: string, @Param('keyPrefix') keyPrefix: string) {
    const result = await this.tenantService.revokeApiKey(tenantId, keyPrefix);
    return { revoked: result !== null, keyPrefix, revokedAt: result?.revokedAt ?? null };
  }
}
