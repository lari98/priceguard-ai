import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

/**
 * MVP-minimal: no public self-serve tenant signup endpoint yet (Phase 6 concern).
 * Tenants are provisioned via `npm run db:seed` or a future internal admin tool.
 */
@Injectable()
export class TenantService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(tenantId: string) {
    const [tenant] = await this.db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    return tenant;
  }

  async findApiKeyByPrefix(keyPrefix: string) {
    const [apiKey] = await this.db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.keyPrefix, keyPrefix))
      .limit(1);
    return apiKey ?? null;
  }

  async findUserByEmail(tenantId: string, email: string) {
    const [user] = await this.db
      .select()
      .from(schema.tenantUsers)
      .where(eq(schema.tenantUsers.email, email))
      .limit(1);
    if (user && user.tenantId !== tenantId) return null;
    return user ?? null;
  }

  async findUserByEmailAnyTenant(email: string) {
    const [user] = await this.db.select().from(schema.tenantUsers).where(eq(schema.tenantUsers.email, email)).limit(1);
    return user ?? null;
  }

  async findUserById(userId: string) {
    const [user] = await this.db.select().from(schema.tenantUsers).where(eq(schema.tenantUsers.id, userId)).limit(1);
    return user ?? null;
  }

  async getRetentionPolicy(tenantId: string) {
    const [policy] = await this.db
      .select()
      .from(schema.retentionPolicies)
      .where(eq(schema.retentionPolicies.tenantId, tenantId))
      .limit(1);
    return policy ?? null;
  }

  /**
   * Phase 9 (Production Hardening): API keys previously had no self-service management —
   * `apiKeys.revokedAt` existed and was checked by `ApiKeyGuard`, but nothing ever set it
   * outside a direct database edit. A real incident-response runbook
   * (docs/security/INCIDENT_RESPONSE.md) needs a real "revoke this compromised key" action,
   * so this closes that gap: list (never returns the hash), create (returns the plaintext
   * secret exactly once), and revoke.
   */
  async listApiKeys(tenantId: string) {
    const rows = await this.db
      .select({
        id: schema.apiKeys.id,
        keyPrefix: schema.apiKeys.keyPrefix,
        createdAt: schema.apiKeys.createdAt,
        revokedAt: schema.apiKeys.revokedAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.tenantId, tenantId));
    return rows;
  }

  /** Returns the plaintext secret exactly once — it is never retrievable again afterward. */
  async createApiKey(tenantId: string) {
    const keyPrefix = `gg_live_${randomBytes(8).toString('hex')}`;
    const secret = randomBytes(24).toString('hex');
    const keyHash = await bcrypt.hash(secret, 12);
    const [row] = await this.db.insert(schema.apiKeys).values({ tenantId, keyPrefix, keyHash }).returning();
    return { keyPrefix: row.keyPrefix, apiKey: `${keyPrefix}.${secret}`, createdAt: row.createdAt };
  }

  /** Idempotent: revoking an already-revoked (or nonexistent-for-this-tenant) key is a no-op, not an error — an incident responder retrying this call under pressure shouldn't get a confusing failure. */
  async revokeApiKey(tenantId: string, keyPrefix: string) {
    const [row] = await this.db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiKeys.tenantId, tenantId), eq(schema.apiKeys.keyPrefix, keyPrefix)))
      .returning({ keyPrefix: schema.apiKeys.keyPrefix, revokedAt: schema.apiKeys.revokedAt });
    return row ?? null;
  }
}
