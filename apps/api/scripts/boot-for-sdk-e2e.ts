/**
 * Boots a real instance of this API (real Postgres via DATABASE_URL, real HTTP listener
 * on an OS-assigned free port) with one seeded tenant + API key, then prints a single
 * line of JSON — {"baseUrl": "...", "apiKey": "..."} — to stdout so an external test
 * runner (the Python SDK's tests/test_client_e2e.py, via subprocess) can drive real HTTP
 * requests against it without duplicating any Node/Nest bootstrapping logic.
 *
 * Intentionally NOT part of the normal `npm test`/`npm run test:e2e` suites — it is only
 * ever invoked by sdk/python/tests/test_client_e2e.py as a subprocess. See that file.
 */
import { createTestApp } from '../test/test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from '../test/seed-helpers';
import { AddressInfo } from 'net';

async function main() {
  const app = await createTestApp();
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const { db } = testDb();
  const seeded = await seedTenantWithApiKeyAndPolicy(db, {
    tenantName: 'Python SDK Test Tenant',
    apiKeyPrefix: `gg_test_py_${process.pid}`,
    apiKeySecret: 'py-sdk-secret',
    userEmail: `admin-py-${process.pid}@sdk.example`,
    userPassword: 'password-123',
  });

  // Single-line JSON so the parent process can read exactly one line and know we're ready.
  process.stdout.write(JSON.stringify({ baseUrl, apiKey: seeded.apiKeyHeader }) + '\n');

  // Keep the process (and its DB pool / HTTP listener) alive until the parent kills it.
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
