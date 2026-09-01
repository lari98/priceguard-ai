import { Module } from '@nestjs/common';
import { ErasureService } from './erasure.service';
import { DsarExportService } from './export.service';
import { DsrController } from './dsr.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [AuthModule, AuditModule, RbacModule],
  providers: [ErasureService, DsarExportService],
  controllers: [DsrController],
  exports: [ErasureService, DsarExportService],
})
export class DsrModule {}
