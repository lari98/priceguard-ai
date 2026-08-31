import { Module } from '@nestjs/common';
import { InvestigationsService } from './investigations.service';
import { AppealsController } from './appeals.controller';
import { InvestigationsController } from './investigations.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditModule, AuthModule],
  providers: [InvestigationsService],
  controllers: [AppealsController, InvestigationsController],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
