import { Module } from '@nestjs/common';
import { ErasureService } from './erasure.service';
import { DsrController } from './dsr.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  providers: [ErasureService],
  controllers: [DsrController],
  exports: [ErasureService],
})
export class DsrModule {}
