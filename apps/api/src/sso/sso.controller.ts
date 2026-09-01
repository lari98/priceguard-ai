import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';
import { Response } from 'express';
import { SsoConfigService } from './sso-config.service';
import { SsoAuthService } from './sso-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

class SsoConfigDto {
  @IsUrl({ require_tld: false })
  issuerUrl!: string;

  @IsString()
  clientId!: string;

  @IsString()
  clientSecret!: string;

  @IsUrl({ require_tld: false })
  redirectUri!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

function redactSecret<T extends { clientSecret: string }>(row: T): Omit<T, 'clientSecret'> {
  const copy: Partial<T> = { ...row };
  delete copy.clientSecret;
  return copy as Omit<T, 'clientSecret'>;
}

@ApiTags('sso')
@Controller('sso')
export class SsoController {
  constructor(
    private readonly ssoConfigService: SsoConfigService,
    private readonly ssoAuthService: SsoAuthService,
  ) {}

  /** Admin-only tenant SSO configuration — issuer/client credentials never leave this endpoint's response to non-admins. */
  @Get('config')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @RequirePermission('sso:manage')
  async getConfig(@CurrentTenant() tenantId: string) {
    const config = await this.ssoConfigService.get(tenantId);
    if (!config) return null;
    // Never echo the client secret back out, even to the admin who set it.
    return redactSecret(config);
  }

  @Post('config')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @RequirePermission('sso:manage')
  async setConfig(@CurrentTenant() tenantId: string, @Body() dto: SsoConfigDto) {
    const row = await this.ssoConfigService.upsert(tenantId, dto);
    return redactSecret(row);
  }

  /** Public — this is the login entrypoint, called before the user has any session. */
  @Get(':tenantId/login')
  async login(@Param('tenantId') tenantId: string, @Res() res: Response) {
    const url = await this.ssoAuthService.buildAuthorizationUrl(tenantId);
    res.redirect(url);
  }

  /** Public IdP redirect target. Returns the issued JWT as JSON (see ADR-0008 for why this isn't yet a browser redirect back into the dashboard SPA). */
  @Get(':tenantId/callback')
  async callback(@Param('tenantId') tenantId: string, @Query('code') code?: string, @Query('state') state?: string) {
    return this.ssoAuthService.handleCallback(tenantId, { code, state });
  }
}
