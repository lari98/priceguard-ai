import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';
import { PriceGuardClient, PriceGuardApiError } from '../../../sdk/node/src';

/**
 * Phase 7 (SDK Ecosystem) — proves the official Node SDK (sdk/node/) actually talks to a
 * real, running instance of this API (real Postgres, real HTTP listener, real API-key
 * auth), not just a stubbed fetch (see sdk/node/test/client.unit.spec.ts for the
 * fast-running stubbed-fetch tests that cover the client's own request-building logic).
 */
describe('Node SDK client (Phase 7) (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let baseUrl: string;
  let apiKeyHeader: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'SDK Test Tenant',
      apiKeyPrefix: 'gg_test_sdk',
      apiKeySecret: 'sdk-secret',
      userEmail: 'admin@sdk.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('ingests a real risk event through the SDK and receives a real risk decision', async () => {
    const client = new PriceGuardClient({ baseUrl, apiKey: apiKeyHeader });

    const decision = await client.createRiskEvent({
      accountId: 'sdk-account-1',
      sdkSessionId: 'sdk-session-1',
      ipAddress: '198.51.100.7',
      deviceId: 'sdk-device-1',
      timestamp: new Date().toISOString(),
      pricingCountry: 'US',
      eventType: 'LOGIN',
    });

    expect(typeof decision.riskScore).toBe('number');
    expect(decision.policyVersion).toBeTruthy();
    expect(decision.modelVersion).toBeTruthy();
    expect(Array.isArray(decision.reasonCodes)).toBe(true);
  });

  it('surfaces a real 401 as PriceGuardApiError for an invalid API key', async () => {
    const client = new PriceGuardClient({ baseUrl, apiKey: 'gg_bogus.notreal' });

    await expect(
      client.createRiskEvent({
        accountId: 'sdk-account-2',
        sdkSessionId: 'sdk-session-2',
        ipAddress: '198.51.100.8',
        deviceId: 'sdk-device-2',
        timestamp: new Date().toISOString(),
        pricingCountry: 'US',
        eventType: 'LOGIN',
      }),
    ).rejects.toThrow(PriceGuardApiError);
  });
});
