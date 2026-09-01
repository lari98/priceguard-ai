import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { AccountsModule } from './accounts/accounts.module';
import { RiskModule } from './risk/risk.module';
import { PolicyModule } from './policy/policy.module';
import { AuditModule } from './audit/audit.module';
import { InvestigationsModule } from './investigations/investigations.module';
import { RetentionModule } from './retention/retention.module';
import { DsrModule } from './dsr/dsr.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MlModule } from './ml/ml.module';
import { FraudGraphModule } from './fraud-graph/fraud-graph.module';
import { RbacModule } from './rbac/rbac.module';
import { SsoModule } from './sso/sso.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
    }),
    DbModule,
    AuthModule,
    TenantModule,
    AccountsModule,
    RiskModule,
    PolicyModule,
    AuditModule,
    InvestigationsModule,
    RetentionModule,
    DsrModule,
    AnalyticsModule,
    MlModule,
    FraudGraphModule,
    RbacModule,
    SsoModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
