import { Module } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { RiskEventsController } from './risk-events.controller';
import { RiskService } from './risk.service';
import { ScoringService } from './scoring.service';
import { RuleEngineModule } from './rule-engine/rule-engine.module';
import { IpIntelligenceModule } from './ip-intelligence/ip-intelligence.module';
import { AccountsModule } from '../accounts/accounts.module';
import { PolicyModule } from '../policy/policy.module';
import { AuditModule } from '../audit/audit.module';
import { InvestigationsModule } from '../investigations/investigations.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RuleEngineModule, IpIntelligenceModule, AccountsModule, PolicyModule, AuditModule, InvestigationsModule, AuthModule],
  controllers: [RiskController, RiskEventsController],
  providers: [RiskService, ScoringService],
  exports: [ScoringService],
})
export class RiskModule {}
