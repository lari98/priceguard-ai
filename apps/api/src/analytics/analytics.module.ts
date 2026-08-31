import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { FeatureStoreService } from './feature-store.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, FeatureStoreService],
  exports: [AnalyticsService, FeatureStoreService],
})
export class AnalyticsModule {}
