import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { FeatureStoreService } from './feature-store.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly featureStoreService: FeatureStoreService,
  ) {}

  @Get('summary')
  async summary(@CurrentTenant() tenantId: string, @Query('windowDays') windowDays?: string) {
    const parsed = windowDays ? Number.parseInt(windowDays, 10) : 30;
    return this.analyticsService.getSummary(tenantId, Number.isFinite(parsed) ? parsed : 30);
  }

  /**
   * Manually trigger a feature-store recompute for a given day (defaults to yesterday,
   * matching the nightly cron). Admin-only: this reads across the tenant's raw event data,
   * and in a future multi-tenant-scale deployment would be rate-limited/queued rather than
   * synchronous — flagged, not silently assumed fine at arbitrary scale (see ADR-0002).
   */
  @Post('feature-snapshots/run')
  @Roles('ADMIN')
  async runFeatureSnapshots(@CurrentTenant() tenantId: string, @Query('date') date?: string) {
    const day = date ? new Date(date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.featureStoreService.computeDailySnapshots(day, tenantId);
  }
}
