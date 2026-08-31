import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';

/**
 * Phase 4 (ML) e2e: exercises the whole shadow-model pipeline against a real Postgres
 * instance — train on the real synthetic dataset, ingest a real risk event over HTTP so a
 * real `risk_scores.facts` row exists, run shadow evaluation against it, check drift, and
 * exercise the human-approval rollout gate. Nothing here is mocked.
 */
describe('ML (Phase 4) (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let apiKeyHeader: string;
  let jwt: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'ML Test Tenant',
      apiKeyPrefix: 'gg_test_ml',
      apiKeySecret: 'secret-ml',
      userEmail: 'admin@ml.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;

    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin@ml.example', password: 'password-123' });
    jwt = login.body.accessToken;

    await request(app.getHttpServer()).post('/v1/risk/events').set('X-PriceGuard-Api-Key', apiKeyHeader).send({
      accountId: 'acct-ml-1',
      sdkSessionId: 'sess-ml-1',
      ipAddress: '198.51.100.10', // DE, per StaticTestIpIntelligenceProvider
      deviceId: 'dev-ml-1',
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

  let trainedVersion: string;

  it('trains a model on the synthetic dataset and registers it', async () => {
    const res = await request(app.getHttpServer()).post('/ml/train').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(201);
    expect(res.body.version).toEqual(expect.any(String));
    expect(res.body.trainingExampleCount).toBeGreaterThan(0);
    expect(res.body.holdoutAccuracy).toBeGreaterThanOrEqual(0);
    expect(res.body.holdoutAccuracy).toBeLessThanOrEqual(1);
    trainedVersion = res.body.version;
  });

  it('lists the registered model', async () => {
    const res = await request(app.getHttpServer()).get('/ml/models').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.some((m: { version: string }) => m.version === trainedVersion)).toBe(true);
  });

  it('runs shadow evaluation against real ingested risk scores', async () => {
    const res = await request(app.getHttpServer()).post('/ml/shadow-eval/run').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(201);
    expect(res.body.evaluated).toBeGreaterThanOrEqual(1);
    expect(res.body.agreementRate).toBeGreaterThanOrEqual(0);
    expect(res.body.agreementRate).toBeLessThanOrEqual(1);
  });

  it('reports a drift check for the evaluated model', async () => {
    const res = await request(app.getHttpServer())
      .get(`/ml/drift?modelVersion=${trainedVersion}`)
      .set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.sampleSize).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.driftDetected).toBe('boolean');
  });

  it('defaults rollout to 0% until an admin explicitly approves it', async () => {
    const before = await request(app.getHttpServer()).get('/ml/rollout').set('Authorization', `Bearer ${jwt}`);
    expect(before.body.rolloutPercentage).toBe(0);

    const approve = await request(app.getHttpServer())
      .post('/ml/rollout/approve')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ modelVersion: trainedVersion, rolloutPercentage: 5 });
    expect(approve.status).toBe(201);
    expect(approve.body.rolloutPercentage).toBe(5);
    expect(approve.body.approvedByUserId).toEqual(expect.any(String));

    const after = await request(app.getHttpServer()).get('/ml/rollout').set('Authorization', `Bearer ${jwt}`);
    expect(after.body.rolloutPercentage).toBe(5);
  });

  it('rejects a non-staged rollout percentage', async () => {
    const res = await request(app.getHttpServer())
      .post('/ml/rollout/approve')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ modelVersion: trainedVersion, rolloutPercentage: 37 });
    expect(res.status).toBe(400);
  });
});
