import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Issuer, generators } from 'openid-client';
import { eq, and, lt } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { SsoConfigService } from './sso-config.service';
import { AuthService } from '../auth/auth.service';

const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000; // 10 minutes — generous for an interactive login redirect round trip

/**
 * Real OIDC relying-party (RP) implementation using `openid-client`: standards-compliant
 * discovery, PKCE (S256), nonce validation, and real id_token signature verification via
 * the IdP's published JWKS — not a hand-rolled JWT decode. Tested end-to-end in
 * test/sso.e2e-spec.ts against a minimal, spec-compliant fake OIDC provider this repo runs
 * for the test only (see that file's header for why a full vendor IdP — Okta/Azure
 * AD/Auth0 — isn't exercised here, and what ADR-0008 flags as still needed before a real
 * enterprise rollout).
 */
@Injectable()
export class SsoAuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly ssoConfigService: SsoConfigService,
    private readonly authService: AuthService,
  ) {}

  private async getClient(tenantId: string) {
    const config = await this.ssoConfigService.getEnabledOrThrow(tenantId);
    const issuer = await Issuer.discover(config.issuerUrl);
    const client = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: [config.redirectUri],
      response_types: ['code'],
    });
    return { client, config };
  }

  async buildAuthorizationUrl(tenantId: string): Promise<string> {
    const { client } = await this.getClient(tenantId);

    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const nonce = generators.nonce();
    const state = generators.state();

    await this.db.insert(schema.ssoLoginAttempts).values({ state, tenantId, nonce, codeVerifier });

    return client.authorizationUrl({
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
  }

  async handleCallback(tenantId: string, params: { code?: string; state?: string }): Promise<{ accessToken: string }> {
    if (!params.state || !params.code) {
      throw new UnauthorizedException('Missing code or state');
    }

    const [attempt] = await this.db.select().from(schema.ssoLoginAttempts).where(eq(schema.ssoLoginAttempts.state, params.state)).limit(1);
    if (!attempt || attempt.tenantId !== tenantId) {
      throw new UnauthorizedException('Unknown or expired login attempt');
    }
    await this.db.delete(schema.ssoLoginAttempts).where(eq(schema.ssoLoginAttempts.state, params.state)); // single-use

    const { client, config } = await this.getClient(tenantId);
    const tokenSet = await client.callback(
      config.redirectUri,
      { code: params.code, state: params.state },
      { code_verifier: attempt.codeVerifier, nonce: attempt.nonce, state: params.state },
    );

    const claims = tokenSet.claims();
    const subject = claims.sub;
    const email = typeof claims.email === 'string' ? claims.email : null;

    const user = await this.findOrProvisionUser(tenantId, subject, email);
    return this.authService.issueToken(user.id, tenantId, user.role, user.tokenVersion);
  }

  private async findOrProvisionUser(tenantId: string, subject: string, email: string | null) {
    const [identity] = await this.db
      .select()
      .from(schema.ssoIdentities)
      .where(and(eq(schema.ssoIdentities.tenantId, tenantId), eq(schema.ssoIdentities.subject, subject)))
      .limit(1);
    if (identity) {
      const [user] = await this.db.select().from(schema.tenantUsers).where(eq(schema.tenantUsers.id, identity.tenantUserId)).limit(1);
      if (user) return user;
    }

    if (!email) {
      throw new UnauthorizedException('IdP did not provide an email claim to link an account');
    }

    const [existingByEmail] = await this.db
      .select()
      .from(schema.tenantUsers)
      .where(and(eq(schema.tenantUsers.tenantId, tenantId), eq(schema.tenantUsers.email, email)))
      .limit(1);

    const user =
      existingByEmail ??
      (
        await this.db
          .insert(schema.tenantUsers)
          .values({ tenantId, email, passwordHash: null, role: 'VIEWER', authProvider: 'OIDC' })
          .returning()
      )[0];

    await this.db.insert(schema.ssoIdentities).values({ tenantId, tenantUserId: user.id, subject }).onConflictDoNothing();
    return user;
  }

  /** Housekeeping for abandoned login attempts — not scheduled anywhere yet (see the schema's comment); callable directly or from a future cron. */
  async purgeExpiredLoginAttempts(): Promise<number> {
    const cutoff = new Date(Date.now() - LOGIN_ATTEMPT_TTL_MS);
    const deleted = await this.db.delete(schema.ssoLoginAttempts).where(lt(schema.ssoLoginAttempts.createdAt, cutoff)).returning();
    return deleted.length;
  }
}
