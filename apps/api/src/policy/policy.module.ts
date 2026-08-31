import { Module } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyEngineService } from './policy-engine.service';
import { PolicyController } from './policy.controller';
import { RuleEngineModule } from '../risk/rule-engine/rule-engine.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RuleEngineModule, AuthModule],
  providers: [PolicyService, PolicyEngineService],
  controllers: [PolicyController],
  exports: [PolicyService, PolicyEngineService],
})
export class PolicyModule {}
