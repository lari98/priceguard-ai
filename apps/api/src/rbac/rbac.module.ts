import { forwardRef, Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  // forwardRef: TenantModule (Phase 9) now imports RbacModule for its API-key-management
  // endpoints' permission checks, and AuthModule already forwardRef-imports TenantModule —
  // this closes that cycle at the RbacModule <-> AuthModule edge too, since a plain
  // literal import here would otherwise resolve to `undefined` at module-evaluation time.
  imports: [forwardRef(() => AuthModule)],
  controllers: [RbacController],
  providers: [RbacService, PermissionsGuard],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
