import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { eq } from 'drizzle-orm';
import { TenantService } from '../../tenant/tenant.service';
import { DRIZZLE, DrizzleDb } from '../../db/db.provider';
import * as schema from '../../db/schema';

export interface JwtPayload {
  sub: string; // tenant user id
  tenantId: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
  jti: string;
  tokenVersion: number;
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
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
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

    // Phase 6 session revocation: a bumped tokenVersion (e.g. "log out everywhere",
    // admin-forced revocation) instantly invalidates every previously issued token for
    // this user, and a single revoked jti invalidates just that one session.
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked');
    }
    const [revoked] = await this.db.select().from(schema.revokedTokens).where(eq(schema.revokedTokens.jti, payload.jti)).limit(1);
    if (revoked) {
      throw new UnauthorizedException('Session has been revoked');
    }

    request.authContext = {
      tenantId: user.tenantId,
      actorType: 'USER',
      actorId: user.id,
      role: user.role,
      jti: payload.jti,
    };
    return true;
  }
}
