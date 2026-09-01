import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';
import { testDb, seedTenantWithApiKeyAndPolicy } from './seed-helpers';
import { startFakeOidcProvider, FakeOidcProvider } from './support/fake-oidc-provider';

/**
 * Phase 6 SSO (e2e) — exercises the real OIDC authorization-code + PKCE flow end to end:
 * this API's `/sso/:tenantId/login` redirect, a real fake-but-spec-compliant IdP's
 * `/authorize` and `/token` endpoints (test/support/fake-oidc-provider.ts), real JWKS-based
 * id_token signature verification inside `openid-client`, and this API's own JWT issuance
 * for the newly-provisioned dashboard user. See docs/adr/0008-enterprise-compliance-scope.md
 * for what this does and does not prove (a real vendor IdP is not exercised here).
 */
describe('SSO (Phase 6) (e2e)', () => {
  let app: INestApplication;
  const { db, pool } = testDb();
  let idp: FakeOidcProvider;
  let tenantId: string;
  let adminJwt: string;
  const redirectUri = 'http://localhost:4000/sso/test-tenant/callback';

  beforeAll(async () => {
    app = await createTestApp();
    idp = await startFakeOidcProvider();

    const seeded = await seedTenantWithApiKeyAndPolicy(db, {
      tenantName: 'SSO Test Tenant',
      apiKeyPrefix: 'gg_test_sso',
      apiKeySecret: 'secret-sso',
      userEmail: 'admin@sso.example',
      userPassword: 'password-123',
    });
    tenantId = seeded.tenant.id;

    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin@sso.example', password: 'password-123' });
    adminJwt = login.body.accessToken;

    const configRes = await request(app.getHttpServer())
      .post('/sso/config')
      .set('Authorization', `Bearer ${adminJwt}`)
      .send({ issuerUrl: idp.issuerUrl, clientId: idp.clientId, clientSecret: idp.clientSecret, redirectUri });
    expect(configRes.status).toBe(201);
    expect(configRes.body.clientSecret).toBeUndefined(); // never echoed back, even to the admin who set it
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await idp.close();
  });

  it('completes a full OIDC login and issues a real JWT for a newly-provisioned user', async () => {
    const loginRedirect = await request(app.getHttpServer()).get(`/sso/${tenantId}/login`);
    expect(loginRedirect.status).toBe(302);
    const authorizeUrl = loginRedirect.headers.location;
    expect(authorizeUrl).toContain(idp.issuerUrl);

    // Follow the fake IdP's own redirect manually (real HTTP, real PKCE challenge issued by
    // the fake IdP's /authorize) without letting fetch auto-follow back into our API.
    const idpResponse = await fetch(authorizeUrl, { redirect: 'manual' });
    expect(idpResponse.status).toBe(302);
    const callbackUrl = new URL(idpResponse.headers.get('location')!);
    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');
    expect(code).toBeTruthy();
    expect(state).toBeTruthy();

    const callbackRes = await request(app.getHttpServer()).get(`/sso/${tenantId}/callback`).query({ code, state });
    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body.accessToken).toEqual(expect.any(String));

    const meRes = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${callbackRes.body.accessToken}`);
    expect(meRes.status).toBe(200); // a real, working session for the SSO-provisioned user
  });

  it('rejects a callback with an unknown state (replay/forgery attempt)', async () => {
    const res = await request(app.getHttpServer()).get(`/sso/${tenantId}/callback`).query({ code: 'whatever', state: 'not-a-real-state' });
    expect(res.status).toBe(401);
  });

  it('the same state cannot be replayed twice (single-use)', async () => {
    const loginRedirect = await request(app.getHttpServer()).get(`/sso/${tenantId}/login`);
    const idpResponse = await fetch(loginRedirect.headers.location, { redirect: 'manual' });
    const callbackUrl = new URL(idpResponse.headers.get('location')!);
    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');

    const first = await request(app.getHttpServer()).get(`/sso/${tenantId}/callback`).query({ code, state });
    expect(first.status).toBe(200);

    const replay = await request(app.getHttpServer()).get(`/sso/${tenantId}/callback`).query({ code, state });
    expect(replay.status).toBe(401);
  });
});
