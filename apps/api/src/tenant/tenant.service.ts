import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
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
}
