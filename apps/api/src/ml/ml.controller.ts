import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsString } from 'class-validator';
import { ModelRegistryService } from './model-registry.service';
import { ShadowEvaluationService } from './shadow-evaluation.service';
import { DriftService } from './drift.service';
import { RolloutConfigService } from './rollout-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentAuthContext } from '../common/decorators/current-tenant.decorator';
import { AuthContext } from '../common/request-context';

class ApproveRolloutDto {
  @IsString()
  modelVersion!: string;

  @IsIn([0, 5, 25, 50, 100])
  @IsInt()
  rolloutPercentage!: number;
}

@ApiTags('ml')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ml')
export class MlController {
  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly shadowEvaluation: ShadowEvaluationService,
    private readonly drift: DriftService,
    private readonly rolloutConfig: RolloutConfigService,
  ) {}

  /**
   * Trains on the current synthetic scenario dataset and registers a new model version.
   * Admin-only and shared across tenants (the dataset is platform-wide synthetic data, not
   * tenant-specific) — see docs/adr/0006-ml-shadow-rollout.md.
   */
  @Post('train')
  @Roles('ADMIN')
  async train() {
    return this.modelRegistry.trainAndRegister();
  }

  @Get('models')
  async listModels() {
    return this.modelRegistry.listModels();
  }

  @Post('shadow-eval/run')
  @Roles('ADMIN')
  async runShadowEval(@CurrentTenant() tenantId: string, @Query('modelVersion') modelVersion?: string) {
    return this.shadowEvaluation.runForTenant(tenantId, modelVersion);
  }

  @Get('drift')
  async checkDrift(@CurrentTenant() tenantId: string, @Query('modelVersion') modelVersion: string) {
    return this.drift.checkDrift(tenantId, modelVersion);
  }

  @Get('rollout')
  async getRollout(@CurrentTenant() tenantId: string) {
    return this.rolloutConfig.getConfig(tenantId);
  }

  /** Human-approval gate — see rollout-config.service.ts's header for what this does and doesn't do. */
  @Post('rollout/approve')
  @Roles('ADMIN')
  async approveRollout(@CurrentTenant() tenantId: string, @CurrentAuthContext() auth: AuthContext, @Body() dto: ApproveRolloutDto) {
    return this.rolloutConfig.approve(tenantId, auth.actorId, dto.modelVersion, dto.rolloutPercentage);
  }
}
