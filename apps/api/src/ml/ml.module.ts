import { Module } from '@nestjs/common';
import { MlController } from './ml.controller';
import { ModelRegistryService } from './model-registry.service';
import { ShadowEvaluationService } from './shadow-evaluation.service';
import { DriftService } from './drift.service';
import { RolloutConfigService } from './rollout-config.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MlController],
  providers: [ModelRegistryService, ShadowEvaluationService, DriftService, RolloutConfigService],
  exports: [ModelRegistryService, ShadowEvaluationService, DriftService],
})
export class MlModule {}
