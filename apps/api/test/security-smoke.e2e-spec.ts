import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';

/**
 * Phase 9 (Production Hardening) — a small, real "DAST-style" smoke test: fires malformed,
 * oversized, and injection-shaped payloads at real HTTP endpoints of a real, running app
 * (real Postgres, real validation pipeline) and asserts the platform degrades safely (a
 * real 400/401, not an unhandled 500 or a crash). This is NOT a substitute for a real DAST
 * scanner (OWASP ZAP, Burp) or a professional penetration test — see
 * docs/adr/0011-production-hardening-scope.md for what this does and does not cover.
 */
describe('Security smoke test (Phase 9) (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let apiKeyHeader: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'Security Smoke Test Tenant',
      apiKeyPrefix: 'gg_test_sec',
      apiKeySecret: 'sec-secret',
      userEmail: 'admin@sec.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const validEvent = () => ({
    accountId: 'sec-account-1',
    sdkSessionId: 'sec-session-1',
    ipAddress: '198.51.100.11',
    deviceId: 'sec-device-1',
    timestamp: new Date().toISOString(),
    pricingCountry: 'US',
    eventType: 'LOGIN',
  });

  const post = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/v1/risk/events').set('x-priceguard-api-key', apiKeyHeader).send(body);

  it("a classic SQL-injection-shaped accountId is safely rejected or handled — never a 500", async () => {
    const res = await post({ ...validEvent(), accountId: "' OR '1'='1'; DROP TABLE end_accounts; --" });
    expect(res.status).toBeLessThan(500);
  });

  it('a "__proto__" accountId does not pollute Object.prototype and is safely handled', async () => {
    const res = await post({ ...validEvent(), accountId: '__proto__' });
    expect(res.status).toBeLessThan(500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(({} as any).polluted).toBeUndefined();
  });

  it('an oversized accountId beyond @MaxLength(256) is rejected with 400, not a 500', async () => {
    const res = await post({ ...validEvent(), accountId: 'a'.repeat(10_000) });
    expect(res.status).toBe(400);
  });

  it('a script-tag XSS-shaped accountId is safely accepted-or-rejected, never reflected unescaped in the response', async () => {
    const payload = '<script>alert(1)</script>';
    const res = await post({ ...validEvent(), accountId: payload });
    expect(res.status).toBeLessThan(500);
    expect(JSON.stringify(res.body)).not.toContain('<script>');
  });

  it('an unexpected extra field is stripped/rejected by the whitelist ValidationPipe, not silently accepted (mass-assignment)', async () => {
    const res = await post({ ...validEvent(), isAdmin: true, tenantId: 'some-other-tenant-id' });
    // whitelist + forbidNonWhitelisted: true on the global ValidationPipe means an unknown
    // property is a 400, not a silently-accepted mass-assignment vector.
    expect(res.status).toBe(400);
  });

  it('a malformed (non-ISO) pricingCountry is rejected with 400', async () => {
    const res = await post({ ...validEvent(), pricingCountry: 'NOT-A-COUNTRY' });
    expect(res.status).toBe(400);
  });

  it('a non-IP ipAddress is rejected with 400', async () => {
    const res = await post({ ...validEvent(), ipAddress: 'not-an-ip; rm -rf /' });
    expect(res.status).toBe(400);
  });

  it('an invalid eventType enum value is rejected with 400', async () => {
    const res = await post({ ...validEvent(), eventType: 'DELETE_EVERYTHING' });
    expect(res.status).toBe(400);
  });

  it('a request with no API key is rejected with 401, not a 500', async () => {
    const res = await request(app.getHttpServer()).post('/v1/risk/events').send(validEvent());
    expect(res.status).toBe(401);
  });

  it('a malformed API key header (no ".") is rejected with 401, not a 500', async () => {
    const res = await request(app.getHttpServer()).post('/v1/risk/events').set('x-priceguard-api-key', 'not-a-valid-key-format').send(validEvent());
    expect(res.status).toBe(401);
  });

  it('a deeply nested/oversized JSON body does not crash the process (bounded body-parser limit)', async () => {
    const res = await post({ ...validEvent(), locale: 'x'.repeat(1_000_000) });
    // Either the body-size limit or field validation should reject this — never a raw
    // socket-level crash that would show up as a connection error instead of a response.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
