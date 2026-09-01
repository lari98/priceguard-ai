---
title: "Changelog"
space: "PriceGuard AI Engineering"
parent: "Governance & Process"
labels: ["governance"]
source: "CHANGELOG.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/), and versioning follows the scheme fixed
in the master project brief:

```
v1.0.0  Initial production release
v1.0.1  Bug/security fixes
v1.0.2  VPN detection fix
v1.0.3  API reliability improvements
v1.1.0  Improved travel detection
v1.2.0  New fraud-graph capabilities
v1.3.0  Additional SDK/integrations
v2.0.0  Major architecture/API/model-generation change
```

No version has shipped yet. Phase 10 (Commercial Launch prep) is complete, but **v1.0.0 has
deliberately not been cut** — see `docs/GA_LAUNCH_CHECKLIST.md`'s "Blocking for GA" table.
This repository remains pre-1.0.0 on top of the completed Phase 0–9 foundation below.

## [Unreleased]

### Added (Phase 10 — Commercial Launch prep: pricing model, GA launch checklist)
- `docs/business/PRICING_MODEL.md`: a concrete hybrid pricing structure (free self-serve
  tier, a usage-based Growth tier, a quote-based Enterprise tier) elaborating the
  preliminary candidates from `docs/PHASE_0_DISCOVERY.md` §Q, grounded in researched 2026
  pricing from comparable fraud/risk-API vendors (MaxMind, IPQualityScore, SEON, Sift,
  Kount) and in this platform's own real architecture (Phase 8's load-test cost profile,
  Phase 6's Enterprise-tier feature investment). Explicitly flagged as a starting
  hypothesis for real pilot negotiations, not a validated price list — no real customer has
  paid for this platform yet.
- `docs/GA_LAUNCH_CHECKLIST.md`: a single, honest consolidation of every gap flagged across
  all eleven ADRs, `SECURITY.md`, and `docs/architecture/THREAT_MODEL.md`, split into
  "Blocking for GA" (real TLS termination, a managed secrets manager, trademark clearance,
  live-vendor-IdP-tested SSO, a named SLA, legal/privacy counsel review) and "not blocking
  but should close soon after GA" (container scanning, a full DAST scanner run, formal
  penetration testing, multi-region deployment, and the rest of each phase's documented
  gaps). Recommendation: do not tag v1.0.0 until the blocking table is empty.
- **No version was cut this phase.** Per this project's anti-overclaiming discipline
  (`docs/PHASE_0_DISCOVERY.md` §R's own "do not represent as compliant/complete without
  real validation" stance, applied consistently through every phase's ADR), preparing GA
  collateral is not the same as being GA-ready, and this repository does not claim
  otherwise.

### Added (Phase 9 — Production Hardening: SBOM/SAST, a real DAST-style smoke test, incident response)
- Real CycloneDX SBOM generation (`npm run sbom` in both `apps/api` and `apps/web`,
  `@cyclonedx/cyclonedx-npm`), wired into CI and uploaded as a build artifact (not
  committed — an SBOM goes stale the moment a dependency bumps).
- A real SAST pass (`npm run lint:security`, `eslint-plugin-security`) wired into CI as an
  informational (non-blocking) step. All 28 findings from the initial run were manually
  triaged against real data flow and are false positives (fixed-string keys, TypeScript
  enum-narrowed keys, bounded numeric indices, DTO-validated strings) — documented in
  `docs/adr/0011-production-hardening-scope.md`; zero required a code change.
- A real "DAST-style" smoke test (`apps/api/test/security-smoke.e2e-spec.ts`) firing
  SQL-injection-shaped, `__proto__`, oversized, XSS-shaped, mass-assignment, and
  malformed-enum payloads at a real running instance. **Found and fixed a real bug**: an
  oversized request body threw a plain (non-`HttpException`) `PayloadTooLargeError` that
  `GlobalExceptionFilter` mapped to a generic 500 instead of the real, safe 413 — the filter
  now passes through a safe 4xx status from non-Nest errors when one is present.
- **Real gap found and fixed while writing the incident-response runbooks**: API keys had a
  `revokedAt` column checked by `ApiKeyGuard` but no endpoint ever set it — there was no way
  to revoke a compromised key without a direct database edit. Added
  `GET/POST /tenants/api-keys` and `POST /tenants/api-keys/:keyPrefix/revoke` (ADMIN-only,
  new `api-keys:manage` RBAC permission), proven end-to-end in
  `apps/api/test/api-key-management.e2e-spec.ts` (create → the new key really works against
  ingestion → list without ever exposing the hash → revoke → the same key immediately gets
  a real 401).
- `docs/security/INCIDENT_RESPONSE.md`: four runbooks (compromised API key, compromised
  dashboard account, suspected tenant-isolation breach, ingestion DoS), each tied to a real
  endpoint and its proving e2e test.
- `docs/adr/0011-production-hardening-scope.md`: honest scope statement — what's tested vs.
  explicitly NOT done (real TLS termination, a managed secrets manager, container image
  scanning, a full DAST scanner run, and formal penetration testing are all design-only or
  not implemented — this sandbox has no cloud infrastructure to demonstrate them against).
- Corrected stale "Prisma" references in `SECURITY.md`, `PRIVACY.md`, and
  `CONTRIBUTING.md` (the project switched to Drizzle in Phase 2 per ADR-0005; the docs had
  never been updated).
- Full suite after this phase: API lint/typecheck/28 unit/53 e2e all green (6 new API-key
  management + 11 new security-smoke e2e tests), SAST/SBOM both run clean in CI, `npm audit
  --omit=dev --audit-level=high`: 0 vulnerabilities; web unchanged (lint/typecheck/build all
  green).

### Added (Phase 8 — Scale: real load testing, a real concurrency-bug fix, capacity tuning)
- `apps/api/scripts/load-test-ingestion.ts` (`npm run load-test`): real load test of
  `POST /v1/risk/events` against a real, running instance of the API (real Postgres, real
  HTTP, real auth) using autocannon — not a synthetic/mocked benchmark.
- **Real concurrency bug found and fixed**: `AccountsService.findOrCreateEndAccount` and
  `findOrCreateDevice` did a check-then-act select-then-insert that raced under concurrent
  requests for the same account/device, producing real unhandled 500s under load (22,445
  failures in the first load-test run). Fixed with atomic
  `INSERT ... ON CONFLICT DO UPDATE` statements — race-free regardless of concurrency,
  confirmed by re-running the load test (0 errors) and the full existing e2e suite (36
  tests, unchanged pass).
- Postgres connection pool size is now configurable (`DB_POOL_MAX`,
  `DB_POOL_IDLE_TIMEOUT_MS`; was `pg`'s undocumented default of 10).
- The ingestion endpoint's rate limit is now configurable (`RISK_INGESTION_RATE_LIMIT`; was
  hardcoded to 100/60s).
- `GET /healthz/ready` (new, alongside the existing `GET /healthz` liveness check since
  Phase 2): a real Postgres connectivity check for a load balancer/orchestrator.
- `docs/performance/PHASE_8_LOAD_TEST.md`: full run-by-run real numbers and this sandbox's
  real hardware caveats (2 vCPU, single Postgres instance, no pooler/replica).
- `docs/adr/0010-scale-phase8-scope.md`: honest scope statement — what's tested (the
  concurrency fix, the rate limiter, the readiness check) vs. explicitly NOT done
  (multi-region/HA deployment evaluated at a design level only — this project has never run
  as more than one process; no graceful-shutdown drain, found as a side-effect of the
  load-test harness itself; rate limiting is per-replica and per-IP, not cluster-wide or
  per-tenant; no dedicated scoring service extraction, since the load test showed the DB
  round-trip count, not in-process scoring, is the actual bottleneck).
- Full suite after this phase: API lint/typecheck/28 unit/36 e2e all green (3 new health
  e2e tests); web unchanged (lint/typecheck/build all green).

### Added (Phase 7 — SDK Ecosystem: Node and Python client SDKs)
- `sdk/node/` (`@priceguard/sdk-node`): TypeScript client wrapping
  `POST /v1/risk/events`, built on the platform `fetch` (zero runtime dependencies), typed
  request/response shapes mirroring the API's DTOs, `PriceGuardApiError` /
  `PriceGuardTimeoutError` typed errors, configurable timeout.
- `sdk/python/` (`priceguard-sdk`): Python 3.9+ equivalent built on `requests`, same
  typed-error/timeout behaviour, `mypy --strict` clean.
- Both SDKs are proven against a **real, running instance of the API** (real Postgres,
  real HTTP, real bcrypt-backed API-key auth), not just stubbed HTTP:
  `apps/api/test/sdk-node-client.e2e-spec.ts` (part of the API's own e2e suite) and
  `sdk/python/tests/test_client_e2e.py` (spawns `apps/api/scripts/boot-for-sdk-e2e.ts` as a
  subprocess). Each also has fast unit tests against stubbed HTTP for the client's own
  request-building/error-mapping logic.
- `docs/adr/0009-sdk-ecosystem-scope.md`: honest scope statement — what's tested vs.
  explicitly NOT done (only the ingestion endpoint wrapped; not OpenAPI-generated; not
  published to npm/PyPI; no retry/batching; only two languages, not the brief's implied
  "full" ecosystem).
- Full suite after this phase: API lint/typecheck/28 unit/33 e2e all green (2 new SDK e2e
  tests); Node SDK build/lint/5 unit tests all green; Python SDK 4 unit + 2 real e2e tests
  all green, `mypy --strict` clean; web unchanged (lint/typecheck/build all green).

### Added (Phase 6 — Enterprise Compliance: SSO, fine-grained RBAC, DSAR export, session revocation)
- `apps/api/src/sso/`: real OIDC authorization-code + PKCE (S256) relying-party using
  `openid-client` v5 — discovery, nonce validation, and id_token signature verification via
  the IdP's published JWKS; tenant-configurable issuer/client credentials (secret never
  echoed back, even to the admin who set it). Tested against a real self-authored
  spec-compliant fake OIDC provider (`test/support/fake-oidc-provider.ts` — real HTTP
  server, real RSA keypair, real JWKS endpoint, real PKCE verification), not a mocked HTTP
  layer — proves the protocol implementation is correct even though no live vendor IdP
  (Okta/Azure AD/Auth0) was exercised (see ADR-0008).
- `apps/api/src/rbac/`, `src/common/permissions.ts`: fine-grained named permissions layered
  on the fixed ADMIN/ANALYST/VIEWER roles, with per-tenant DB overrides. Wired onto a real
  endpoint (`appeals:decide` on `POST /appeals/:id/decision`) as a working example, not left
  as an unused abstraction.
- Session revocation: every JWT now carries a `tokenVersion` claim checked against
  `tenant_users.token_version` (bulk revocation — "log out everywhere" and admin-forced
  revocation of another user's sessions) plus a `jti` blocklist (`revoked_tokens`,
  single-session logout) — closes the gap `docs/architecture/THREAT_MODEL.md` had flagged
  as a pending Phase 6 hardening item. New endpoints: `POST /auth/logout`,
  `POST /auth/logout-all`, `POST /auth/users/:userId/revoke-sessions`.
- `apps/api/src/dsr/export.service.ts`: DSAR self-service export
  (`GET /dsr/end-accounts/:id/export`) — the Art. 15/20 access/portability complement to
  Phase 2's Art. 17 erasure endpoint (ADR-0004); gathers every row of personal data the
  platform holds for one end-account via the real riskEvents→riskScores→policyDecisions→
  investigations→appeals foreign-key chain.
- Real gap found and fixed while wiring SSO: `tenant_users.role` defaulted `ANALYST`;
  SSO-provisioned users now correctly default to the more conservative `VIEWER`, since an
  IdP-authenticated identity has no tenant-side vetting of what access level it should start
  with.
- New combined `Settings` dashboard page (SSO config, RBAC permission matrix, session
  revocation control), ADMIN-gated.
- `docs/adr/0008-enterprise-compliance-scope.md`: full honest-scope statement — what's
  genuinely tested (see above) vs. explicitly NOT done: no live vendor IdP tested, no SAML,
  no MFA, the SSO callback returns JSON rather than a browser redirect into the dashboard
  SPA, and `revoked_tokens`/`sso_login_attempts` rows are never purged. Read this before
  treating Phase 6 as "enterprise-ready" without qualification.
- 5 new unit-adjacent RBAC/session e2e tests plus 3 new SSO e2e tests (8 new e2e tests
  total), plus the existing DSAR erasure suite extended with export assertions. Full suite
  after this phase: API lint/typecheck/28 unit/31 e2e all green; web lint/typecheck/build
  all green (15 routes, including the new `/settings` page).

### Added (Phase 5 — Fraud graph, Scenario 8)
- `apps/api/src/fraud-graph/`: real connected-components clustering (union-find,
  unit-tested) over accounts sharing a device or payment method, running directly on
  Postgres rather than a dedicated graph database (ADR-0007).
- Real gap found and fixed while building this: `devices`' `(tenant_id, device_hash)`
  uniqueness meant a device shared by a second account was invisible to any query — fixed
  with a new `device_account_links` join table populated on every session, independent of
  which account "owns" the canonical device row.
- `fraud_clusters` table + `GET /fraud-graph/clusters` / `POST /fraud-graph/clusters/run`:
  on-demand and persisted cluster detection, admin-triggered.
- Fraud Graph dashboard page: cluster cards with a real (accurate, not decorative)
  star-graph SVG visualization of each cluster's shared-signal structure.
- **Scenario 8 is now a real, passing test** (`test/fraud-graph.e2e-spec.ts`) instead of the
  Phase 2 MVP's honest `it.todo` — real HTTP ingestion for multiple accounts sharing a
  device, real cluster detection, real assertion that an unrelated account is excluded.
- `docs/adr/0007-fraud-graph-on-postgres.md`: what's real vs. explicitly deferred (clusters
  don't yet feed policy decisions; no fuzzy/similarity matching; no dedicated graph engine).
- 2 new unit tests (union-find), 3 new e2e tests. Full suite after this phase: API
  lint/typecheck/28 unit/23 e2e all green (no `it.todo` remaining); web
  lint/typecheck/build all green.

### Added (Phase 4 — ML shadow-model pipeline)
- `apps/api/src/ml/`: real logistic-regression training (`training/logistic-regression.ts`,
  gradient descent + min-max scaling, unit-tested against a hand-built separable dataset),
  a Postgres-backed model registry (`ml_models`), shadow evaluation against real ingested
  risk scores (`ml_shadow_evaluations`), drift detection, and a human-approval-gated
  staged-rollout config (`ml_rollout_config`, percentages restricted to 0/5/25/50/100).
- `risk_scores.facts` (new column): the rule engine's raw `FactMap` is now persisted
  alongside `evidence`, so the shadow model is scored on the exact same features the
  production rule engine used for that decision (train/serve feature parity).
- `ML` dashboard page: train/shadow-eval buttons, model registry table, drift readout, and
  the rollout-approval control — all wired to the real API, admin-gated where appropriate.
- `docs/adr/0006-ml-shadow-rollout.md`: honest scope statement — what's real (the pipeline
  mechanics) vs. explicitly not done (the model is illustrative-scale, not production-grade;
  an approved rollout percentage does not yet gate live traffic; no adversarial-resilience
  work). Read this before treating Phase 4 as "ML-powered fraud detection in production".
- Covered by 4 new unit tests (trainer math, not just "doesn't throw") and 5 new e2e tests
  (real HTTP + real Postgres: train, list, shadow-eval, drift, rollout approve/reject).
  Full suite after this phase: API lint/typecheck/27 unit/20 e2e all green; web
  lint/typecheck/build all green.

### Added (Phase 3 — Advanced Analytics)
- Batch feature store (`account_feature_snapshots` table, `FeatureStoreService`): nightly
  cron plus an on-demand admin-triggered endpoint (`POST /analytics/feature-snapshots/run`)
  computing per-account daily signal snapshots (event count, distinct countries/IPs, VPN
  ratio, avg/max risk score) from the real `risk_events`/`sessions`/`risk_scores` tables —
  a real streaming platform + columnar analytics store remains deferred per ADR-0002 until
  ingestion volume justifies it (documented in `docs/architecture/C4_DIAGRAMS.md`).
- Analytics read API (`AnalyticsService`, `GET /analytics/summary`): per-day risk-event
  trend, top likely-primary countries (weighted by the risk score's fractional country
  shares), and policy-action breakdown, all computed over a bounded (≤90-day) real-data
  window — no mock data.
- Analytics dashboard page (`apps/web/.../analytics`): trend line chart, top-countries and
  policy-action bar charts, window selector (7/30/90 days), wired to the real API.
- Expanded abuse-scenario catalogue (`docs/ml/ABUSE_SCENARIO_CATALOGUE.md` +
  `apps/api/src/risk/fixtures/abuse-scenarios.json`): scenarios 9–14 (cold-start fraud,
  account takeover, frequent-traveler false-positive guard, bot/emulator pattern, household
  sharing, and payment-method account-farm clustering), as synthetic labelled feature
  vectors for Phase 4's training pipeline — flagged as synthetic/unreviewed-by-a-domain-
  expert, not a substitute for real abuse data or fraud-team review.
- Covered by 1 new unit test and 3 new e2e tests (real HTTP + real Postgres): summary
  reflects real ingested events, 401 without a JWT, and a manual feature-snapshot run
  writes a real row. Full suite after this phase: API lint/typecheck/23 unit
  tests/14 e2e tests, web lint/typecheck/build all green.

### Added (Phase 0–2, previously shipped)
- Phase 0 discovery document.
- Phase 1 architecture set: C4 diagrams, ERD, data-flow diagram, OpenAPI draft, security
  architecture, GDPR data map, STRIDE threat model.
- ADR-0001 (Phase 0 scope), ADR-0002 (technology stack), ADR-0003 (repo/module structure),
  ADR-0004 (audit-log pseudonymisation vs. erasure), ADR-0005 (Drizzle, not Prisma).
- Phase 2 MVP backend (`apps/api`, NestJS + Drizzle ORM + PostgreSQL): tenant/API-key/JWT
  auth, risk-event ingestion, explainable rule-based scoring engine (recency-weighted
  country dominance, VPN/travel-adjustment, device stability), no-code policy/rule engine
  with a hard server-side Article 22 GDPR safeguard, investigations + appeals workflow,
  append-only audit log, retention scheduler, DSR erasure (pseudonymisation, not deletion,
  per ADR-0004). Covered by 21 passing unit tests (encoding the Phase 0 §34 abuse/legit
  scenarios) and 11 passing e2e tests (tenant isolation, risk ingestion, appeals, DSR
  erasure) against a real PostgreSQL instance — no mocked database.
- Phase 2 MVP admin dashboard (`apps/web`, Next.js 16 + React 19): Overview, Risk Events,
  Accounts (with DSR erasure action), Investigations, Appeals (with decide action), Policy
  & Rules (with a rule builder and Article 22 safeguard messaging), and Audit Log pages,
  all backed by real API calls — no mock data.
- Local dev stack: `infra/docker/docker-compose.yml` (PostgreSQL 18, Valkey 8, API, web,
  with a one-shot migration job) and multi-stage `Dockerfile`s for both apps.
- CI: `.github/workflows/ci.yml` (lint, typecheck, unit tests, e2e tests against a real
  Postgres/Valkey service, `npm audit`, Docker image builds) for both `apps/api` and
  `apps/web`.
- Self-generated, Confluence-import-ready documentation export (`docs/confluence/`,
  produced by `scripts/generate-confluence-space.js`) — no live Atlassian connection, per
  explicit project-owner instruction.

### Changed
- Renamed the product from "GeoGuard AI" (working name, see ADR-0001) to **PriceGuard AI**
  across the entire codebase, per explicit project-owner instruction: npm package scopes
  (`@geoguard/*` → `@priceguard/*`), the Postgres role/database name, the Swagger API title,
  the `X-GeoGuard-Api-Key` header (now `X-PriceGuard-Api-Key`), all UI copy (dashboard title,
  login page, sidebar), Docker/CI service and image names, and every doc (README, PRIVACY,
  ADRs, architecture set, generated Confluence export). Re-verified after the rename: API
  lint/typecheck/unit (21 passing)/e2e (11 passing, against a real PostgreSQL instance) and
  web lint/typecheck/build all pass. GitHub repo: `priceguard-ai`.

### Fixed
- `apps/api/package.json`'s `start:prod` script pointed at `dist/main` — the actual Nest
  build output is `dist/src/main.js` (source root is `src/`, per `nest-cli.json`). Found
  while writing `apps/api/Dockerfile`'s runtime stage and verified by actually running
  `npm run start:prod` against a real database, not just reading the script.
- `drizzle-orm` lists `@prisma/client` as an optional peer dependency (its unused Prisma
  adapter); npm's default behaviour was silently installing a full unused Prisma 7.9.1
  tree on every `npm install`, re-introducing the exact dependency ADR-0005 removed, along
  with 3 high-severity `npm audit` findings. Fixed with `"overrides": {"@prisma/client":
  false}`; see the follow-up note in ADR-0005 for the verification steps.
- Documentation consistency pass: stale `tests/e2e/...` path references (actual location
  is `apps/api/test/...`) in `THREAT_MODEL.md` and `SECURITY_ARCHITECTURE.md`; stale
  mentions of Prisma and a `TenantScopedRepository` base class that was never literally
  implemented (the actual tenant-isolation pattern is explicit `tenantId` parameters on
  every service method, verified by `apps/api/test/tenant-isolation.e2e-spec.ts`) in
  `ADR-0003`, `THREAT_MODEL.md`, `SECURITY_ARCHITECTURE.md`, `GDPR_DATA_MAP.md`, and
  `C4_DIAGRAMS.md`.

### Known gaps (not yet done)
- `docker compose build`/`up` could not be executed end-to-end inside this development
  sandbox: its network egress policy returns `403 Forbidden` for every container registry
  tried (`registry-1.docker.io`, `ghcr.io`, `quay.io`, `mcr.microsoft.com`,
  `public.ecr.aws`), the same class of restriction ADR-0005 documents for
  `binaries.prisma.sh`. The compose file's syntax is validated (`docker compose config`
  succeeds) and every command each Dockerfile stage runs (`npm ci`/`npm run build`/`npm
  prune --omit=dev`/`next build`'s standalone output) was verified directly on the host
  instead; the actual image builds need to be run once on a machine/CI runner with
  registry access to close this gap.
