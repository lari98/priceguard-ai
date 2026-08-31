/**
 * Development/test seed script (`npm run db:seed`). Uses only synthetic data, per the
 * master brief's testing rules ("use realistic synthetic data rather than real people's
 * personal information").
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as schema from './schema';

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://geoguard:geoguard_dev_password@localhost:5432/geoguard';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: 'StreamDemo (synthetic demo tenant)', dataResidency: 'EU' })
    .returning();

  await db.insert(schema.retentionPolicies).values({ tenantId: tenant.id });

  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
  await db.insert(schema.tenantUsers).values({
    tenantId: tenant.id,
    email: 'analyst@streamdemo.example',
    passwordHash,
    role: 'ADMIN',
  });

  const keySecret = 'dev-secret-do-not-use-in-production';
  const keyHash = await bcrypt.hash(keySecret, 12);
  await db.insert(schema.apiKeys).values({
    tenantId: tenant.id,
    keyPrefix: 'gg_test_streamdemo',
    keyHash,
  });

  const [policy] = await db
    .insert(schema.policies)
    .values({ tenantId: tenant.id, name: 'Default StreamDemo policy', version: 1, active: true })
    .returning();

  await db.insert(schema.rules).values([
    {
      policyId: policy.id,
      name: 'High-confidence sustained mismatch -> request verification',
      condition: {
        and: [
          { fact: 'primaryCountryConfidence', op: 'gte', value: 0.85 },
          { fact: 'pricingCountryMismatch', op: 'eq', value: true },
          { fact: 'observationDays', op: 'gte', value: 60 },
          { fact: 'travelProbability', op: 'lt', value: 0.2 },
        ],
      },
      action: 'REQUEST_VERIFICATION',
      requiresHumanReview: true,
      order: 1,
    },
    {
      policyId: policy.id,
      name: 'Single VPN session, otherwise consistent -> monitor only',
      condition: {
        and: [
          { fact: 'vpnLikelihood', op: 'gte', value: 0.7 },
          { fact: 'observationDays', op: 'lt', value: 14 },
        ],
      },
      action: 'MONITOR',
      requiresHumanReview: false,
      order: 2,
    },
  ]);

  console.log(`Seeded tenant ${tenant.id} with API key prefix gg_test_streamdemo (secret: ${keySecret})`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
