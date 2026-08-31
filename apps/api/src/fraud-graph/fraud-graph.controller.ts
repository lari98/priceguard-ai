import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FraudGraphService } from './fraud-graph.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('fraud-graph')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fraud-graph')
export class FraudGraphController {
  constructor(private readonly fraudGraphService: FraudGraphService) {}

  @Get('clusters')
  async listClusters(@CurrentTenant() tenantId: string, @Query('minClusterSize') minClusterSize?: string) {
    const parsed = minClusterSize ? Number.parseInt(minClusterSize, 10) : undefined;
    return this.fraudGraphService.detectClusters(tenantId, Number.isFinite(parsed) ? parsed : undefined);
  }

  @Post('clusters/run')
  async runAndPersist(@CurrentTenant() tenantId: string, @Query('minClusterSize') minClusterSize?: string) {
    const parsed = minClusterSize ? Number.parseInt(minClusterSize, 10) : undefined;
    return this.fraudGraphService.detectAndPersistClusters(tenantId, Number.isFinite(parsed) ? parsed : undefined);
  }
}
