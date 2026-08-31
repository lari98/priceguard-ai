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

No version has shipped yet. This repository is pre-1.0.0, in active Phase 4 (ML)
development, on top of the completed Phase 0–3 foundation below.

## [Unreleased]

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
