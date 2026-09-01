import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, JWK } from 'jose';

/**
 * A minimal, spec-compliant fake OIDC provider used ONLY by test/sso.e2e-spec.ts, so
 * Phase 6's SSO relying-party code (src/sso/) is proven against a real OIDC
 * authorization-code + PKCE flow over real HTTP — real discovery, a real JWKS fetch, and
 * real id_token RS256 signature verification by `openid-client` — rather than mocked at
 * the function level. It deliberately implements only what a relying party needs to
 * complete a login: no consent screen, no real user database, a single fixed test
 * identity. See docs/adr/0008-enterprise-compliance-scope.md for why this stands in for a
 * real vendor IdP (Okta/Azure AD/Auth0) rather than testing against one directly.
 */
export interface FakeOidcProvider {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  testUser: { sub: string; email: string };
  close: () => Promise<void>;
}

export async function startFakeOidcProvider(): Promise<FakeOidcProvider> {
  const clientId = 'test-client-id';
  const clientSecret = 'test-client-secret';
  const testUser = { sub: 'fake-idp-user-1', email: 'sso-user@example.com' };

  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key-1', alg: 'RS256', use: 'sig' };

  const pendingAuthCodes = new Map<
    string,
    { codeChallenge: string; nonce: string; redirectUri: string }
  >();

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  let issuerUrl = ''; // set once the server is listening, needed inside the discovery doc handler

  app.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/authorize`,
      token_endpoint: `${issuerUrl}/token`,
      jwks_uri: `${issuerUrl}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'email', 'profile'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
    });
  });

  app.get('/jwks', (_req, res) => {
    res.json({ keys: [jwk] });
  });

  app.get('/authorize', (req, res) => {
    const { redirect_uri, state, code_challenge, nonce } = req.query as Record<string, string>;
    const code = randomUUID();
    pendingAuthCodes.set(code, { codeChallenge: code_challenge, nonce, redirectUri: redirect_uri });
    const location = new URL(redirect_uri);
    location.searchParams.set('code', code);
    location.searchParams.set('state', state);
    res.redirect(location.toString());
  });

  app.post('/token', async (req, res) => {
    const { code, code_verifier, redirect_uri } = req.body as Record<string, string>;
    const pending = pendingAuthCodes.get(code);
    if (!pending) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }
    pendingAuthCodes.delete(code); // single-use, like a real IdP

    const computedChallenge = createHash('sha256').update(code_verifier).digest('base64url');
    if (computedChallenge !== pending.codeChallenge || redirect_uri !== pending.redirectUri) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ email: testUser.email, nonce: pending.nonce })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setSubject(testUser.sub)
      .setIssuer(issuerUrl)
      .setAudience(clientId)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    res.json({
      access_token: randomUUID(),
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken,
    });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  issuerUrl = `http://127.0.0.1:${port}`;

  return {
    issuerUrl,
    clientId,
    clientSecret,
    testUser,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
