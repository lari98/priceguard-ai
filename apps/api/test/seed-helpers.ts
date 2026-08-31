import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as schema from '../src/db/schema';

/**
 * Test-only helpers for creating a fully-formed tenant (with an API key, a dashboard
 * user, and a policy) directly against the test database — bypassing the HTTP layer so
 * each e2e spec can set up its fixtures quickly and independently.
 */
export function testDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return { db: drizzle(pool, { schema }), pool };
}

export async function seedTenantWithApiKeyAndPolicy(
  db: ReturnType<typeof drizzle>,
  opts: { tenantName: string; apiKeyPrefix: string; apiKeySecret: string; userEmail: string; userPassword: string },
) {
  const [tenant] = await db.insert(schema.tenants).values({ name: opts.tenantName, dataResidency: 'EU' }).returning();
  await db.insert(schema.retentionPolicies).values({ tenantId: tenant.id });

  const keyHash = await bcrypt.hash(opts.apiKeySecret, 4); // low cost factor — tests only
  await db.insert(schema.apiKeys).values({ tenantId: tenant.id, keyPrefix: opts.apiKeyPrefix, keyHash });

  const passwordHash = await bcrypt.hash(opts.userPassword, 4);
  await db.insert(schema.tenantUsers).values({ tenantId: tenant.id, email: opts.userEmail, passwordHash, role: 'ADMIN' });

  const [policy] = await db
    .insert(schema.policies)
    .values({ tenantId: tenant.id, name: 'Test policy', version: 1, active: true })
    .returning();

  await db.insert(schema.rules).values([
    {
      policyId: policy.id,
      name: 'Sustained mismatch -> verification',
      condition: {
        and: [
          { fact: 'pricingCountryMismatch', op: 'eq', value: true },
          { fact: 'observationDays', op: 'gte', value: 60 },
          { fact: 'travelProbability', op: 'lt', value: 0.2 },
        ],
      },
      action: 'REQUEST_VERIFICATION',
      requiresHumanReview: true,
      order: 1,
    },
  ]);

  return { tenant, apiKeyHeader: `${opts.apiKeyPrefix}.${opts.apiKeySecret}` };
}
