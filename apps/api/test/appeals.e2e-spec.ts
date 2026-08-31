import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';

describe('Appeals workflow (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let apiKeyHeader: string;
  let jwt: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'Appeals Test Tenant',
      apiKeyPrefix: 'gg_test_appeals',
      apiKeySecret: 'secret-appeals',
      userEmail: 'admin@appeals.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@appeals.example', password: 'password-123' });
    jwt = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('an end customer can appeal a REQUEST_VERIFICATION decision, and an analyst can overturn it', async () => {
    const now = new Date('2026-08-18T12:00:00Z');
    let last: request.Response | undefined;
    for (let d = 90; d >= 0; d -= 5) {
      const ts = new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
      last = await request(app.getHttpServer())
        .post('/v1/risk/events')
        .set('X-PriceGuard-Api-Key', apiKeyHeader)
        .send({
          accountId: 'acct-appeal-flow',
          sdkSessionId: `sess-${d}`,
          ipAddress: '198.51.100.10',
          deviceId: 'dev-appeal-flow',
          timestamp: ts,
          pricingCountry: 'PK',
          eventType: 'LOGIN',
        });
    }
    const investigationId = last!.body.investigationId;
    expect(investigationId).not.toBeNull();

    const submitRes = await request(app.getHttpServer())
      .post('/appeals')
      .set('X-PriceGuard-Api-Key', apiKeyHeader)
      .send({ investigationId, submittedByExternalId: 'acct-appeal-flow', message: 'I relocated permanently.' });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.status).toBe('OPEN');

    // An unauthenticated caller (no JWT, no API key) must not be able to decide an appeal.
    const unauthDecide = await request(app.getHttpServer()).post(`/appeals/${submitRes.body.id}/decision`).send({ outcome: 'OVERTURNED' });
    expect(unauthDecide.status).toBe(401);

    const decideRes = await request(app.getHttpServer())
      .post(`/appeals/${submitRes.body.id}/decision`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ outcome: 'OVERTURNED', notes: 'Verified relocation.' });
    expect(decideRes.status).toBe(201);
    expect(decideRes.body.status).toBe('OVERTURNED');

    const auditRes = await request(app.getHttpServer()).get('/audit-log').set('Authorization', `Bearer ${jwt}`);
    const actions = auditRes.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['APPEAL_SUBMITTED', 'APPEAL_OVERTURNED']));
  });
});
