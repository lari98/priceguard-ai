import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';

/**
 * Proves the tenant-isolation guarantee claimed in
 * docs/architecture/SECURITY_ARCHITECTURE.md ("Defense in depth for multi-tenant
 * isolation") at the HTTP API level — the strongest form of evidence for this property,
 * since it exercises the real guards, real services, and real database queries together.
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();

  let tenantAToken: string;
  let tenantBToken: string;
  let tenantAApiKey: string;
  let tenantAPolicyId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const a = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'Tenant A',
      apiKeyPrefix: 'gg_test_tenant_a',
      apiKeySecret: 'secret-a',
      userEmail: 'admin@tenant-a.example',
      userPassword: 'password-a-123',
    });
    tenantAApiKey = a.apiKeyHeader;

    // Tenant B only ever needs its dashboard JWT below, not its API key — intentionally
    // not bound to a name (the seed call's side effect, creating the tenant, is the point).
    await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'Tenant B',
      apiKeyPrefix: 'gg_test_tenant_b',
      apiKeySecret: 'secret-b',
      userEmail: 'admin@tenant-b.example',
      userPassword: 'password-b-123',
    });

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@tenant-a.example', password: 'password-a-123' });
    tenantAToken = loginA.body.accessToken;

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@tenant-b.example', password: 'password-b-123' });
    tenantBToken = loginB.body.accessToken;

    const policiesA = await request(app.getHttpServer()).get('/policies').set('Authorization', `Bearer ${tenantAToken}`);
    tenantAPolicyId = policiesA.body[0].id;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("Tenant B's JWT cannot see Tenant A's policies", async () => {
    const res = await request(app.getHttpServer()).get('/policies').set('Authorization', `Bearer ${tenantBToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(tenantAPolicyId);
  });

  it("Tenant B's JWT cannot see Tenant A's audit log entries", async () => {
    // Generate an audit entry for Tenant A via a risk event first.
    await request(app.getHttpServer())
      .post('/v1/risk/events')
      .set('X-PriceGuard-Api-Key', tenantAApiKey)
      .send({
        accountId: 'acct-isolation-1',
        sdkSessionId: 'sess-1',
        ipAddress: '198.51.100.10',
        deviceId: 'dev-1',
        timestamp: new Date().toISOString(),
        pricingCountry: 'DE',
        eventType: 'LOGIN',
      });

    const tenantAAudit = await request(app.getHttpServer()).get('/audit-log').set('Authorization', `Bearer ${tenantAToken}`);
    expect(tenantAAudit.body.length).toBeGreaterThan(0);

    const tenantBAudit = await request(app.getHttpServer()).get('/audit-log').set('Authorization', `Bearer ${tenantBToken}`);
    const tenantAEntryIds = new Set(tenantAAudit.body.map((e: { id: string }) => e.id));
    for (const entry of tenantBAudit.body) {
      expect(tenantAEntryIds.has(entry.id)).toBe(false);
    }
  });

  it("Tenant A's API key cannot be used to authenticate as Tenant B (wrong secret for prefix is rejected)", async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/risk/events')
      .set('X-PriceGuard-Api-Key', 'gg_test_tenant_b.secret-a') // Tenant B's prefix, Tenant A's secret
      .send({
        accountId: 'acct-x',
        sdkSessionId: 'sess-x',
        ipAddress: '198.51.100.10',
        deviceId: 'dev-x',
        timestamp: new Date().toISOString(),
        pricingCountry: 'DE',
        eventType: 'LOGIN',
      });
    expect(res.status).toBe(401);
  });

  it('an end account created under Tenant A is not reachable via Tenant B DSR erasure', async () => {
    const ingestRes = await request(app.getHttpServer())
      .post('/v1/risk/events')
      .set('X-PriceGuard-Api-Key', tenantAApiKey)
      .send({
        accountId: 'acct-isolation-2',
        sdkSessionId: 'sess-2',
        ipAddress: '198.51.100.10',
        deviceId: 'dev-2',
        timestamp: new Date().toISOString(),
        pricingCountry: 'DE',
        eventType: 'LOGIN',
      });
    expect(ingestRes.status).toBe(201); // Nest's default status for POST without @HttpCode override

    const accounts = await db.query.endAccounts.findMany();
    const target = accounts.find((a) => a.externalId === 'acct-isolation-2');
    expect(target).toBeDefined();

    const eraseAsB = await request(app.getHttpServer())
      .delete(`/dsr/end-accounts/${target!.id}`)
      .set('Authorization', `Bearer ${tenantBToken}`);
    expect(eraseAsB.status).toBe(404);
  });
});
