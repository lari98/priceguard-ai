import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.factory';

/**
 * Phase 8 (Scale) — proves the liveness/readiness endpoints against a real, running app
 * with a real Postgres connection (see docs/adr/0010-scale-phase8-scope.md).
 */
describe('Health endpoints (Phase 8) (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz returns 200 without touching the database', async () => {
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /healthz/ready returns 200 when the database is reachable', async () => {
    const res = await request(app.getHttpServer()).get('/healthz/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('both endpoints are unauthenticated (no API key / JWT required)', async () => {
    const liveness = await request(app.getHttpServer()).get('/healthz');
    const readiness = await request(app.getHttpServer()).get('/healthz/ready');
    expect(liveness.status).not.toBe(401);
    expect(readiness.status).not.toBe(401);
  });
});
