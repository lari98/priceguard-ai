import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';

/**
 * End-to-end (real HTTP + real Postgres) version of Scenario 3 from
 * docs/PHASE_0_DISCOVERY.md §34 — complementing the pure-unit-test version in
 * scoring.service.spec.ts by proving the *whole* pipeline (ingestion API -> accounts ->
 * scoring -> policy -> investigation -> audit log) works together, not just the scoring
 * math in isolation.
 */
describe('Risk ingestion pipeline (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let apiKeyHeader: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'RiskIngestion Test Tenant',
      apiKeyPrefix: 'gg_test_risk_ingestion',
      apiKeySecret: 'secret-risk',
      userEmail: 'admin@risk-ingestion.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  function post(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/v1/risk/events').set('X-PriceGuard-Api-Key', apiKeyHeader).send(body);
  }

  it('a single normal login produces no risk (Scenario 1 shape)', async () => {
    const res = await post({
      accountId: 'acct-normal',
      sdkSessionId: 'sess-1',
      ipAddress: '198.51.100.10', // DE, per StaticTestIpIntelligenceProvider
      deviceId: 'dev-normal',
      timestamp: new Date().toISOString(),
      pricingCountry: 'DE',
      timezone: 'Europe/Berlin',
      locale: 'de-DE',
      eventType: 'LOGIN',
    });

    expect(res.status).toBe(201);
    expect(res.body.policyAction).toBe('NONE');
    expect(res.body.requiresHumanReview).toBe(false);
    expect(res.body.investigationId).toBeNull();
  });

  it('sustained country/pricing mismatch over time triggers REQUEST_VERIFICATION and opens an investigation', async () => {
    const now = new Date('2026-08-18T12:00:00Z');
    let last: request.Response | undefined;

    for (let d = 90; d >= 0; d -= 5) {
      const ts = new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
      last = await post({
        accountId: 'acct-mismatch-e2e',
        sdkSessionId: `sess-${d}`,
        ipAddress: '198.51.100.10', // DE
        deviceId: 'dev-mismatch-e2e',
        timestamp: ts,
        pricingCountry: 'PK', // billed for the cheaper region throughout
        timezone: 'Europe/Berlin',
        locale: 'de-DE',
        eventType: 'LOGIN',
      });
    }

    expect(last).toBeDefined();
    expect(last!.status).toBe(201);
    expect(last!.body.policyAction).toBe('REQUEST_VERIFICATION');
    expect(last!.body.requiresHumanReview).toBe(true);
    expect(last!.body.investigationId).not.toBeNull();
    expect(last!.body.riskScore).toBeGreaterThanOrEqual(60);

    // The investigation and its audit trail must actually exist in the database, not
    // just be claimed in the HTTP response.
    const investigations = await db.query.investigations.findMany();
    const created = investigations.find((i) => i.id === last!.body.investigationId);
    expect(created).toBeDefined();
    expect(created!.status).toBe('PENDING');
  });

  it('a single VPN-flagged session with no sustained history produces a low, non-actionable score (Scenario 4 shape)', async () => {
    const res = await post({
      accountId: 'acct-single-vpn',
      sdkSessionId: 'sess-vpn',
      ipAddress: '203.0.113.50', // synthetic "PK via VPN" test IP, high vpnLikelihood
      deviceId: 'dev-single-vpn',
      timestamp: new Date().toISOString(),
      pricingCountry: 'DE',
      eventType: 'LOGIN',
    });

    expect(res.status).toBe(201);
    expect(res.body.policyAction).toBe('NONE');
    expect(res.body.riskScore).toBeLessThan(30);
  });

  it('rejects a request missing required fields with 400, and never reaches the database', async () => {
    const res = await post({ accountId: 'acct-incomplete' });
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognised field due to whitelist validation (defends against payload smuggling)', async () => {
    const res = await post({
      accountId: 'acct-whitelist-test',
      sdkSessionId: 'sess-1',
      ipAddress: '198.51.100.10',
      deviceId: 'dev-1',
      timestamp: new Date().toISOString(),
      pricingCountry: 'DE',
      eventType: 'LOGIN',
      unexpectedInternalField: 'should-be-rejected',
    });
    expect(res.status).toBe(400);
  });
});
