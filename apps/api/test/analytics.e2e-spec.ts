import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Phase 3 (Advanced Analytics) e2e: proves the real pipeline end to end — ingest risk
 * events over HTTP against a real Postgres instance, then confirm the analytics summary
 * endpoint reflects them, and that a manually-triggered feature-store recompute writes
 * real `account_feature_snapshots` rows (not mocked, not asserted only in unit tests).
 */
describe('Analytics (Phase 3) (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let apiKeyHeader: string;
  let jwt: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'Analytics Test Tenant',
      apiKeyPrefix: 'gg_test_analytics',
      apiKeySecret: 'secret-analytics',
      userEmail: 'admin@analytics.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@analytics.example', password: 'password-123' });
    jwt = login.body.accessToken;

    await request(app.getHttpServer()).post('/v1/risk/events').set('X-PriceGuard-Api-Key', apiKeyHeader).send({
      accountId: 'acct-analytics-1',
      sdkSessionId: 'sess-analytics-1',
      ipAddress: '198.51.100.10', // DE, per StaticTestIpIntelligenceProvider
      deviceId: 'dev-analytics-1',
      timestamp: new Date().toISOString(),
      pricingCountry: 'DE',
      timezone: 'Europe/Berlin',
      locale: 'de-DE',
      eventType: 'LOGIN',
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('summary reflects real ingested events', async () => {
    const res = await request(app.getHttpServer())
      .get('/analytics/summary?windowDays=7')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.totalEvents).toBeGreaterThanOrEqual(1);
    expect(res.body.totalAccountsSeen).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.trend)).toBe(true);
    expect(Array.isArray(res.body.topCountries)).toBe(true);
  });

  it('rejects analytics access without a JWT', async () => {
    const res = await request(app.getHttpServer()).get('/analytics/summary');
    expect(res.status).toBe(401);
  });

  it('manually-triggered feature-store recompute writes a real snapshot row', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .post(`/analytics/feature-snapshots/run?date=${today}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(201);
    expect(res.body.snapshotsWritten).toBeGreaterThanOrEqual(1);

    const rows = await db
      .select()
      .from(schema.accountFeatureSnapshots)
      .where(eq(schema.accountFeatureSnapshots.featureVersion, 'v1'));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].eventCount).toBeGreaterThanOrEqual(1);
  });
});
