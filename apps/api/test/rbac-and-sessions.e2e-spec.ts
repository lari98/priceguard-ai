import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy, createTenantUser } from './seed-helpers';

/**
 * Phase 6 (Enterprise Compliance) e2e — fine-grained RBAC overrides and session
 * revocation, both against a real Postgres instance and real HTTP.
 */
describe('RBAC overrides and session revocation (Phase 6) (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let apiKeyHeader: string;
  let adminJwt: string;
  let analystJwt: string;
  let analystUserId: string;
  let appealId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'RBAC Test Tenant',
      apiKeyPrefix: 'gg_test_rbac',
      apiKeySecret: 'secret-rbac',
      userEmail: 'admin@rbac.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;

    const analyst = await createTenantUser(db, {
      tenantId: seeded.tenant.id,
      email: 'analyst@rbac.example',
      password: 'password-123',
      role: 'ANALYST',
    });
    analystUserId = analyst.id;

    const adminLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin@rbac.example', password: 'password-123' });
    adminJwt = adminLogin.body.accessToken;
    const analystLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: 'analyst@rbac.example', password: 'password-123' });
    analystJwt = analystLogin.body.accessToken;

    // Real ingestion (same sustained cross-border mismatch shape as appeals.e2e-spec.ts's
    // Scenario 3) so there's a real investigation to appeal against, and a real appeal to
    // decide — no fixtures hand-inserted below the API surface.
    const now = new Date('2026-08-18T12:00:00Z');
    let last: request.Response | undefined;
    for (let d = 90; d >= 0; d -= 5) {
      const ts = new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
      last = await request(app.getHttpServer())
        .post('/v1/risk/events')
        .set('X-PriceGuard-Api-Key', apiKeyHeader)
        .send({
          accountId: 'acct-rbac-flow',
          sdkSessionId: `sess-${d}`,
          ipAddress: '198.51.100.10',
          deviceId: 'dev-rbac-flow',
          timestamp: ts,
          pricingCountry: 'PK',
          eventType: 'LOGIN',
        });
    }
    const investigationId = last!.body.investigationId;

    const submitRes = await request(app.getHttpServer())
      .post('/appeals')
      .set('X-PriceGuard-Api-Key', apiKeyHeader)
      .send({ investigationId, submittedByExternalId: 'acct-rbac-flow', message: 'I relocated permanently.' });
    appealId = submitRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('ANALYST can decide an appeal by default (appeals:decide is granted by default)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/appeals/${appealId}/decision`)
      .set('Authorization', `Bearer ${analystJwt}`)
      .send({ outcome: 'UPHELD', notes: 'confirmed' });
    expect(res.status).toBe(201);
  });

  it("ADMIN can revoke the ANALYST role's appeals:decide permission via an override", async () => {
    const res = await request(app.getHttpServer())
      .post('/rbac/overrides')
      .set('Authorization', `Bearer ${adminJwt}`)
      .send({ role: 'ANALYST', permission: 'appeals:decide', granted: false });
    expect(res.status).toBe(201);

    const effective = await request(app.getHttpServer()).get('/rbac/effective').set('Authorization', `Bearer ${adminJwt}`);
    expect(effective.body.ANALYST).not.toContain('appeals:decide');
  });

  it('a non-admin cannot manage RBAC overrides', async () => {
    const res = await request(app.getHttpServer())
      .post('/rbac/overrides')
      .set('Authorization', `Bearer ${analystJwt}`)
      .send({ role: 'ANALYST', permission: 'appeals:decide', granted: true });
    expect(res.status).toBe(403);
  });

  it('revoking a single session (logout) invalidates only that token', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'analyst@rbac.example', password: 'password-123' });
    const freshJwt = login.body.accessToken;

    const before = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${freshJwt}`);
    expect(before.status).toBe(200);

    const logout = await request(app.getHttpServer()).post('/auth/logout').set('Authorization', `Bearer ${freshJwt}`);
    expect(logout.status).toBe(200);

    const after = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${freshJwt}`);
    expect(after.status).toBe(401);

    // The other, still-valid analyst token is unaffected by revoking this one session.
    const otherStillWorks = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${analystJwt}`);
    expect(otherStillWorks.status).toBe(200);
  });

  it('an admin can force-revoke every session for another user', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'analyst@rbac.example', password: 'password-123' });
    const targetJwt = login.body.accessToken;

    const before = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${targetJwt}`);
    expect(before.status).toBe(200);

    const revoke = await request(app.getHttpServer())
      .post(`/auth/users/${analystUserId}/revoke-sessions`)
      .set('Authorization', `Bearer ${adminJwt}`);
    expect(revoke.status).toBe(200);

    const after = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${targetJwt}`);
    expect(after.status).toBe(401);
  });
});
