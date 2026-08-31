import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ErasureService } from './erasure.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAuthContext, CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { AuthContext } from '../common/request-context';

@ApiTags('dsr')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dsr/end-accounts')
export class DsrController {
  constructor(private readonly erasureService: ErasureService) {}

  @Delete(':id')
  @Roles('ADMIN')
  async erase(@CurrentTenant() tenantId: string, @CurrentAuthContext() authContext: AuthContext, @Param('id') endAccountId: string) {
    return this.erasureService.eraseEndAccount(tenantId, endAccountId, authContext.actorId);
  }
}
