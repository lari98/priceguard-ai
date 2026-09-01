/**
 * Phase 8 (Scale) — real load test of POST /v1/risk/events against a real, running
 * instance of this API (real Postgres via the priceguard_test database, real bcrypt API
 * key auth, real rule-engine scoring — nothing stubbed) using autocannon.
 *
 * This is NOT a synthetic/mocked benchmark — it boots the actual Nest app the same way
 * apps/api/test/*.e2e-spec.ts do (createTestApp) and fires real HTTP traffic at it.
 * Results are captured honestly in docs/performance/PHASE_8_LOAD_TEST.md — see that file
 * for the actual numbers from the run used to write ADR-0010, along with this sandbox's
 * real hardware limitations (shared vCPU, single Postgres instance, no connection
 * pooler/PgBouncer, no horizontal replicas) that numbers here should be read against.
 *
 * Usage: DATABASE_URL_TEST=... npm run load-test  (see package.json)
 */
import autocannon, { Client } from 'autocannon';
import { AddressInfo } from 'net';
import { createTestApp } from '../test/test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from '../test/seed-helpers';

const DURATION_SECONDS = Number(process.env.LOAD_TEST_DURATION_SECONDS ?? 20);
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS ?? 20);

async function main() {
  const app = await createTestApp();
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const { db, pool } = testDb();
  const seeded = await seedTenantWithApiKeyAndPolicy(db, {
    tenantName: 'Load Test Tenant',
    apiKeyPrefix: `gg_test_load_${process.pid}`,
    apiKeySecret: 'load-test-secret',
    userEmail: `admin-load-${process.pid}@sdk.example`,
    userPassword: 'password-123',
  });

  console.log(`Booted at ${baseUrl}. Running ${CONNECTIONS} connections for ${DURATION_SECONDS}s...`);

  let counter = 0;
  const result = await autocannon({
    url: `${baseUrl}/v1/risk/events`,
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-priceguard-api-key': seeded.apiKeyHeader,
    },
    setupClient: (client: Client) => {
      // Each virtual user cycles through distinct accountIds so the run exercises real
      // account/device/session creation, not a single cached hot row.
      client.setBody(
        JSON.stringify({
          accountId: `load-account-${counter++}`,
          sdkSessionId: `load-session-${counter}`,
          ipAddress: `198.51.100.${(counter % 200) + 1}`,
          deviceId: `load-device-${counter % 50}`,
          timestamp: new Date().toISOString(),
          pricingCountry: 'US',
          eventType: 'LOGIN',
        }),
      );
    },
  });

  console.log(autocannon.printResult(result));
  console.log(JSON.stringify({ requests: result.requests, latency: result.latency, errors: result.errors, non2xx: result.non2xx }, null, 2));

  // Real finding from an earlier run of this script (see docs/performance/PHASE_8_LOAD_TEST.md
  // "Graceful shutdown gap"): autocannon's `duration` stops SENDING new requests once the
  // clock runs out, but the server can still be draining an in-flight backlog it already
  // accepted. Closing the DB pool immediately produced real "Cannot use a pool after
  // calling end on the pool" errors for that backlog — a test-harness artifact, not
  // something a real client would trigger, but it exposed a genuine gap: this API has no
  // SIGTERM-triggered graceful-shutdown drain (see main.ts and ADR-0010 §"What is
  // explicitly NOT done"). Draining here before closing keeps this script's own numbers
  // honest; the underlying gap in main.ts is documented, not silently patched around.
  await new Promise((resolve) => setTimeout(resolve, 3_000));

  await app.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
