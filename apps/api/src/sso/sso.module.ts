import { Module } from '@nestjs/common';
import { SsoController } from './sso.controller';
import { SsoConfigService } from './sso-config.service';
import { SsoAuthService } from './sso-auth.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SsoController],
  providers: [SsoConfigService, SsoAuthService],
  exports: [SsoConfigService, SsoAuthService],
})
export class SsoModule {}
