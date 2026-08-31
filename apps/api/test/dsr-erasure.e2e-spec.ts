import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';
import * as schema from '../src/db/schema';

/**
 * Verifies ADR-0004's erasure/pseudonymisation behaviour end-to-end: directly-linked
 * personal data is actually gone from the database, and audit history referencing the
 * erased account is redacted rather than deleted.
 */
describe('DSR erasure (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let apiKeyHeader: string;
  let jwt: string;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'DSR Test Tenant',
      apiKeyPrefix: 'gg_test_dsr',
      apiKeySecret: 'secret-dsr',
      userEmail: 'admin@dsr.example',
      userPassword: 'password-123',
    });
    apiKeyHeader = seeded.apiKeyHeader;

    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin@dsr.example', password: 'password-123' });
    jwt = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('erases an end account and redacts (not deletes) audit history referencing it', async () => {
    const ingest = await request(app.getHttpServer())
      .post('/v1/risk/events')
      .set('X-PriceGuard-Api-Key', apiKeyHeader)
      .send({
        accountId: 'acct-to-erase',
        sdkSessionId: 'sess-1',
        ipAddress: '198.51.100.10',
        deviceId: 'dev-to-erase',
        timestamp: new Date().toISOString(),
        pricingCountry: 'DE',
        eventType: 'LOGIN',
      });
    expect(ingest.status).toBe(201);

    const accountRow = (await db.query.endAccounts.findMany()).find((a) => a.externalId === 'acct-to-erase');
    expect(accountRow).toBeDefined();
    const endAccountId = accountRow!.id;

    // Force an investigation + appeal so there is an audit entry that genuinely embeds
    // this account's externalId (the appeal's `submittedByExternalId` field) — otherwise
    // the redaction assertions below would pass vacuously against audit rows that never
    // mentioned the account in the first place.
    const now = new Date('2026-08-18T12:00:00Z');
    let lastIngest: request.Response | undefined;
    for (let d = 90; d >= 0; d -= 10) {
      lastIngest = await request(app.getHttpServer())
        .post('/v1/risk/events')
        .set('X-PriceGuard-Api-Key', apiKeyHeader)
        .send({
          accountId: 'acct-to-erase',
          sdkSessionId: `sess-hist-${d}`,
          ipAddress: '198.51.100.10',
          deviceId: 'dev-to-erase',
          timestamp: new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString(),
          pricingCountry: 'PK',
          eventType: 'LOGIN',
        });
    }
    const investigationId = lastIngest!.body.investigationId;
    expect(investigationId).not.toBeNull();

    const appealRes = await request(app.getHttpServer())
      .post('/appeals')
      .set('X-PriceGuard-Api-Key', apiKeyHeader)
      .send({ investigationId, submittedByExternalId: 'acct-to-erase', message: 'Please review my account.' });
    expect(appealRes.status).toBe(201);

    const auditBeforeErasure = await db.select().from(schema.auditLogEntries);
    const mentionedBefore = auditBeforeErasure.some((row) => JSON.stringify(row.afterState ?? {}).includes('acct-to-erase'));
    expect(mentionedBefore).toBe(true); // sanity check: the test setup actually created a reference worth redacting

    const eraseRes = await request(app.getHttpServer())
      .delete(`/dsr/end-accounts/${endAccountId}`)
      .set('Authorization', `Bearer ${jwt}`);
    expect(eraseRes.status).toBe(200);
    expect(eraseRes.body.pseudonym).toMatch(/^erased:/);

    const remaining = await db.select().from(schema.endAccounts).where(eq(schema.endAccounts.id, endAccountId));
    expect(remaining).toHaveLength(0);

    const remainingSessions = await db.select().from(schema.sessions).where(eq(schema.sessions.endAccountId, endAccountId));
    expect(remainingSessions).toHaveLength(0);

    const auditRows = await db.select().from(schema.auditLogEntries);
    const stillMentionsRawId = auditRows.some((row) => JSON.stringify(row.beforeState ?? {}).includes(endAccountId) || JSON.stringify(row.afterState ?? {}).includes(endAccountId));
    expect(stillMentionsRawId).toBe(false);

    const stillMentionsExternalId = auditRows.some(
      (row) => JSON.stringify(row.beforeState ?? {}).includes('acct-to-erase') || JSON.stringify(row.afterState ?? {}).includes('acct-to-erase'),
    );
    expect(stillMentionsExternalId).toBe(false);

    // The erasure action itself must still be visible in the audit trail — accountability
    // (ADR-0004) is about redacting personal data, not hiding that erasure happened.
    const auditRes = await request(app.getHttpServer()).get('/audit-log').set('Authorization', `Bearer ${jwt}`);
    const actions = auditRes.body.map((e: { action: string }) => e.action);
    expect(actions).toContain('END_ACCOUNT_ERASED');
  });
});
