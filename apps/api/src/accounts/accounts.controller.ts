import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

/**
 * Dashboard-facing, JWT-authenticated read endpoints over end accounts. Distinct from
 * apps/api/src/risk/risk.controller.ts (API-key authenticated, write-only ingestion
 * used by the tenant's own backend integration) — this controller is what the Next.js
 * admin dashboard (apps/web) calls.
 */
@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async list(@CurrentTenant() tenantId: string) {
    return this.accountsService.listEndAccounts(tenantId);
  }

  @Get(':id')
  async detail(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const detail = await this.accountsService.getAccountDetail(tenantId, id);
    if (!detail) {
      throw new NotFoundException(`End account ${id} not found`);
    }
    return detail;
  }
}
