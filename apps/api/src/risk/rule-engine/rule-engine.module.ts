import { Module } from '@nestjs/common';
import { RuleEngineService } from './rule-engine.service';

/**
 * Small, dependency-free module so both RiskModule and PolicyModule can share the same
 * RuleEngineService instance without a circular import between them (ADR-0003).
 */
@Module({
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
