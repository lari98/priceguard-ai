import { forwardRef, Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TenantModule } from '../tenant/tenant.module';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    forwardRef(() => TenantModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET'),
        // `expiresIn` accepts vercel/ms-style strings ("8h") at runtime; the published
        // type is narrower than the library actually accepts, hence the local cast.
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') } as JwtModuleOptions['signOptions'],
      }),
    }),
  ],
  providers: [AuthService, ApiKeyGuard, JwtAuthGuard],
  controllers: [AuthController],
  // Re-exports TenantModule so that any module importing AuthModule to use its guards
  // also gets TenantService available — required because Nest constructs a guard's
  // dependencies using the *consuming* controller's module context, not AuthModule's.
  exports: [forwardRef(() => TenantModule), ApiKeyGuard, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
