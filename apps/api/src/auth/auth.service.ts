import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { TenantService } from '../tenant/tenant.service';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly jwtService: JwtService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.tenantService.findUserByEmailAnyTenant(email);
    // Constant-shape error regardless of whether the email exists (or is SSO-only), to
    // avoid user enumeration / leaking which auth method a given email uses.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueToken(user.id, user.tenantId, user.role, user.tokenVersion);
  }

  async issueToken(userId: string, tenantId: string, role: 'ADMIN' | 'ANALYST' | 'VIEWER', tokenVersion: number) {
    const jti = randomUUID();
    const accessToken = await this.jwtService.signAsync({ sub: userId, tenantId, role, jti, tokenVersion });
    return { accessToken };
  }

  /** Revokes only the current session (the token this request was authenticated with). */
  async logout(jti: string, tenantUserId: string, tokenExpiresAt: Date): Promise<void> {
    await this.db.insert(schema.revokedTokens).values({ jti, tenantUserId, expiresAt: tokenExpiresAt }).onConflictDoNothing();
  }

  /** Revokes every session for this user, past and future, until they log in again — a real "log out everywhere". */
  async logoutAllSessions(tenantUserId: string): Promise<void> {
    const [user] = await this.db.select().from(schema.tenantUsers).where(eq(schema.tenantUsers.id, tenantUserId)).limit(1);
    if (!user) return;
    await this.db.update(schema.tenantUsers).set({ tokenVersion: user.tokenVersion + 1 }).where(eq(schema.tenantUsers.id, tenantUserId));
  }
}
