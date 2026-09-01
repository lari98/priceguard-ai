import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy, createTenantUser } from './seed-helpers';

/**
 * Phase 9 (Production Hardening) — API-key self-service management: previously
 * `apiKeys.revokedAt` existed but nothing ever set it outside a direct database edit. See
 * docs/security/INCIDENT_RESPONSE.md for the runbook this exists to support.
 */
describe('API key management (Phase 9) (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let adminJwt: string;
  let viewerJwt: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'API Key Mgmt Test Tenant',
      apiKeyPrefix: 'gg_test_akm',
      apiKeySecret: 'akm-secret',
      userEmail: 'admin@akm.example',
      userPassword: 'password-123',
    });
    tenantId = seeded.tenant.id;

    const adminLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin@akm.example', password: 'password-123' });
    adminJwt = adminLogin.body.accessToken;

    await createTenantUser(db, { tenantId, email: 'viewer@akm.example', password: 'password-123', role: 'VIEWER' });
    const viewerLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: 'viewer@akm.example', password: 'password-123' });
    viewerJwt = viewerLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('an ADMIN can create a new API key, and the response includes the plaintext secret exactly once', async () => {
    const res = await request(app.getHttpServer()).post('/tenants/api-keys').set('Authorization', `Bearer ${adminJwt}`);
    expect(res.status).toBe(201);
    expect(res.body.apiKey).toMatch(/^gg_live_[0-9a-f]+\.[0-9a-f]+$/);
    expect(res.body.keyPrefix).toBeTruthy();
  });

  it('the newly created key actually works against the real ingestion endpoint', async () => {
    const created = await request(app.getHttpServer()).post('/tenants/api-keys').set('Authorization', `Bearer ${adminJwt}`);
    const newKey = created.body.apiKey as string;

    const ingest = await request(app.getHttpServer())
      .post('/v1/risk/events')
      .set('x-priceguard-api-key', newKey)
      .send({
        accountId: 'akm-account-1',
        sdkSessionId: 'akm-session-1',
        ipAddress: '198.51.100.20',
        deviceId: 'akm-device-1',
        timestamp: new Date().toISOString(),
        pricingCountry: 'US',
        eventType: 'LOGIN',
      });
    expect(ingest.status).toBe(201);
  });

  it('an ADMIN can list API keys without ever seeing the hash', async () => {
    const res = await request(app.getHttpServer()).get('/tenants/api-keys').set('Authorization', `Bearer ${adminJwt}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const key of res.body) {
      expect(key.keyHash).toBeUndefined();
      expect(key.keyPrefix).toBeTruthy();
    }
  });

  it('revoking a key makes it immediately fail real API-key auth (incident-response core case)', async () => {
    const created = await request(app.getHttpServer()).post('/tenants/api-keys').set('Authorization', `Bearer ${adminJwt}`);
    const { keyPrefix, apiKey } = created.body;

    const revoke = await request(app.getHttpServer()).post(`/tenants/api-keys/${keyPrefix}/revoke`).set('Authorization', `Bearer ${adminJwt}`);
    expect(revoke.status).toBe(201);
    expect(revoke.body.revoked).toBe(true);

    const ingest = await request(app.getHttpServer())
      .post('/v1/risk/events')
      .set('x-priceguard-api-key', apiKey)
      .send({
        accountId: 'akm-account-2',
        sdkSessionId: 'akm-session-2',
        ipAddress: '198.51.100.21',
        deviceId: 'akm-device-2',
        timestamp: new Date().toISOString(),
        pricingCountry: 'US',
        eventType: 'LOGIN',
      });
    expect(ingest.status).toBe(401);
  });

  it('revoking a key that does not belong to this tenant is a safe no-op, not a leak/error', async () => {
    const res = await request(app.getHttpServer()).post('/tenants/api-keys/gg_live_nonexistent/revoke').set('Authorization', `Bearer ${adminJwt}`);
    expect(res.status).toBe(201);
    expect(res.body.revoked).toBe(false);
  });

  it('a VIEWER cannot manage API keys (403)', async () => {
    const res = await request(app.getHttpServer()).post('/tenants/api-keys').set('Authorization', `Bearer ${viewerJwt}`);
    expect(res.status).toBe(403);
  });
});
