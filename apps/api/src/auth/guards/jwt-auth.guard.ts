import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { TenantService } from '../../tenant/tenant.service';

export interface JwtPayload {
  sub: string; // tenant user id
  tenantId: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
}

/**
 * Authenticates dashboard users via a short-lived JWT. Role is re-derived from the DB on
 * every request rather than trusted purely from the token claim, so a role change/user
 * deactivation takes effect immediately rather than waiting for token expiry — see
 * docs/architecture/SECURITY_ARCHITECTURE.md, trust boundary #3.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = authHeader.slice('Bearer '.length);

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.tenantService.findUserById(payload.sub);
    if (!user || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('User no longer valid for this tenant');
    }

    request.authContext = {
      tenantId: user.tenantId,
      actorType: 'USER',
      actorId: user.id,
      role: user.role,
    };
    return true;
  }
}
