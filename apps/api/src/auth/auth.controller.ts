import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard, JwtPayload } from './guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAuthContext } from '../common/decorators/current-tenant.decorator';
import { AuthContext } from '../common/request-context';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly tenantService: TenantService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // tighter limit on the auth endpoint specifically
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  /** Revokes only the current session (Phase 6 session revocation). */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request, @CurrentAuthContext() auth: AuthContext) {
    const token = req.headers.authorization!.slice('Bearer '.length);
    const payload = this.jwtService.decode<JwtPayload & { exp: number }>(token);
    await this.authService.logout(payload.jti, auth.actorId, new Date(payload.exp * 1000));
    return { loggedOut: true };
  }

  /** Revokes every session for the current user ("log out everywhere"). */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentAuthContext() auth: AuthContext) {
    await this.authService.logoutAllSessions(auth.actorId);
    return { loggedOut: true };
  }

  /** Admin-forced revocation of another user's sessions — e.g. a suspected compromised account. */
  @Post('users/:userId/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async revokeUserSessions(@CurrentAuthContext() auth: AuthContext, @Param('userId') userId: string) {
    const target = await this.tenantService.findUserById(userId);
    if (!target || target.tenantId !== auth.tenantId) {
      throw new ForbiddenException('User not found in this tenant');
    }
    await this.authService.logoutAllSessions(userId);
    return { revoked: true };
  }
}
