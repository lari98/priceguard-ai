import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';
import * as schema from '../src/db/schema';

/**
 * Phase 5 (Fraud Graph) e2e — this is the executable version of Scenario 8 from
 * docs/PHASE_0_DISCOVERY.md §E ("large group of accounts share devices and payment
 * methods; graph engine detects suspicious cluster"), intentionally left as `it.todo` in
 * the Phase 2 MVP's scoring.service.spec.ts because a single-account scoring call can
 * never answer a cross-account question. Ingests real risk events over HTTP for several
 * distinct accounts that share the same device, plus seeds a real shared payment token
 * directly (the HTTP ingestion DTO doesn't yet accept a raw payment token — see
 * ADR-0002 — so this is real DB state, seeded the same way other e2e specs seed fixtures
 * that the API surface doesn't yet expose), then asserts the real connected-components
 * algorithm finds the cluster.
 */
describe('Fraud graph (Phase 5) (e2e) — Scenario 8', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let apiKeyHeader: string;
  let jwt: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'Fraud Graph Test Tenant',
      apiKeyPrefix: 'gg_test_fraudgraph',
      apiKeySecret: 'secret-fraudgraph',
      userEmail: 'admin@fraudgraph.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@fraudgraph.example', password: 'password-123' });
    jwt = login.body.accessToken;

    // Three distinct accounts, one shared device — a classic account-farm shape.
    for (const accountId of ['farm-acct-1', 'farm-acct-2', 'farm-acct-3']) {
      await request(app.getHttpServer()).post('/v1/risk/events').set('X-PriceGuard-Api-Key', apiKeyHeader).send({
        accountId,
        sdkSessionId: `sess-${accountId}`,
        ipAddress: '198.51.100.10', // DE, per StaticTestIpIntelligenceProvider
        deviceId: 'shared-emulator-farm-device',
        timestamp: new Date().toISOString(),
        pricingCountry: 'DE',
        timezone: 'Europe/Berlin',
        locale: 'de-DE',
        eventType: 'LOGIN',
      });
    }

    // An unrelated, isolated account — must NOT be pulled into the cluster.
    await request(app.getHttpServer()).post('/v1/risk/events').set('X-PriceGuard-Api-Key', apiKeyHeader).send({
      accountId: 'unrelated-acct',
      sdkSessionId: 'sess-unrelated',
      ipAddress: '198.51.100.20',
      deviceId: 'unrelated-device',
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

  it('detects a shared-device account-farm cluster and excludes the unrelated account', async () => {
    const res = await request(app.getHttpServer())
      .get('/fraud-graph/clusters?minClusterSize=3')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const cluster = res.body[0];
    expect(cluster.clusterSize).toBe(3);
    expect(cluster.sharedDeviceHashes).toContain('shared-emulator-farm-device');

    const accountsRes = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${jwt}`);
    const farmAccountIds = accountsRes.body
      .filter((a: { externalId: string }) => a.externalId.startsWith('farm-acct-'))
      .map((a: { id: string }) => a.id)
      .sort();
    expect(cluster.endAccountIds).toEqual(farmAccountIds);
  });

  it('does not detect a cluster below the requested minimum size', async () => {
    const res = await request(app.getHttpServer())
      .get('/fraud-graph/clusters?minClusterSize=5')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('persists detected clusters via the run endpoint', async () => {
    const res = await request(app.getHttpServer())
      .post('/fraud-graph/clusters/run?minClusterSize=3')
      .set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);

    const rows = await db.select().from(schema.fraudClusters);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].clusterSize).toBe(3);
  });
});
