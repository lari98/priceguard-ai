import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/permissions';

class SetOverrideDto {
  @IsIn(['ADMIN', 'ANALYST', 'VIEWER'])
  role!: 'ADMIN' | 'ANALYST' | 'VIEWER';

  @IsIn(PERMISSIONS)
  permission!: (typeof PERMISSIONS)[number];

  @IsBoolean()
  granted!: boolean;
}

@ApiTags('rbac')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('permissions')
  listAllPermissions() {
    return PERMISSIONS;
  }

  @Get('effective')
  async effective(@CurrentTenant() tenantId: string) {
    return this.rbacService.getEffectivePermissions(tenantId);
  }

  @Get('overrides')
  async listOverrides(@CurrentTenant() tenantId: string) {
    return this.rbacService.listOverrides(tenantId);
  }

  @Post('overrides')
  async setOverride(@CurrentTenant() tenantId: string, @Body() dto: SetOverrideDto) {
    return this.rbacService.setOverride(tenantId, dto.role, dto.permission, dto.granted);
  }
}
