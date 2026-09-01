# ADR-0009: Phase 7 SDK Ecosystem — scope and what's genuinely tested

## Status
Accepted (Phase 7).

## Context
The master brief scopes a "full SDK ecosystem" as a Phase 7 deliverable, explicitly
deferred past the Phase 2 MVP (`docs/PHASE_0_DISCOVERY.md` §O: "the full SDK ecosystem
beyond one or two reference SDKs (Phase 7)"). Before this phase, `sdk/` was an empty
placeholder directory referenced only by `README.md`.

## Decision
Phase 7 ships two real, tested client SDKs wrapping the ingestion endpoint
(`POST /v1/risk/events`, the only endpoint tenants integrate against directly — everything
else is dashboard-only and reached by tenant staff, not tenant code):

1. **`sdk/node/`** (`@priceguard/sdk-node`) — TypeScript, built on the platform `fetch`
   (Node 18+), zero runtime dependencies.
2. **`sdk/python/`** (`priceguard-sdk`) — Python 3.9+, built on `requests`.

Both expose one method, `createRiskEvent`/`create_risk_event`, matching the API's single
tenant-facing ingestion call, with typed request/response shapes, a `<prefix>.<secret>`
API-key parameter, configurable timeout, and two typed error classes
(`PriceGuardApiError`, `PriceGuardTimeoutError`).

## What is genuinely tested (not asserted, verified)
- Each SDK has fast unit tests against a stubbed HTTP layer
  (`sdk/node/test/client.unit.spec.ts` with a substituted `fetch`;
  `sdk/python/tests/test_client_unit.py` with the `responses` library) covering the
  client's own request-building and error-mapping logic.
- Each SDK additionally has a **real** end-to-end test that boots an actual instance of
  `apps/api` (real Postgres, real HTTP listener, real bcrypt-backed API-key auth) and
  drives the SDK against it over real HTTP — consistent with this project's standing
  "e2e tests run against real infrastructure, never mocked" discipline:
  - Node: `apps/api/test/sdk-node-client.e2e-spec.ts`, part of the API's own
    `npm run test:e2e:reset` suite (it needs the API's test-app bootstrap and seed
    helpers, so it lives there rather than in `sdk/node/`).
  - Python: `sdk/python/tests/test_client_e2e.py`, which spawns
    `apps/api/scripts/boot-for-sdk-e2e.ts` as a subprocess (`npx ts-node`) against the same
    `priceguard_test` database, reads the single JSON line it prints once the server is
    listening and a tenant/API-key are seeded, then makes real HTTP calls. Skipped (not
    failed) if `npx`/Node isn't available in the environment running the Python tests.
  - Both real-e2e tests assert a genuine 2xx risk decision for a valid event **and** a
    genuine 401 mapped to the SDK's typed error for an invalid API key.

## What is explicitly NOT done, and why
1. **Only the ingestion endpoint is wrapped.** Every other API surface (auth, ML, RBAC,
   SSO, DSAR, fraud-graph, appeals, analytics) is dashboard/admin-facing and reached by
   tenant staff through the web dashboard, not by tenant application code — so it was not
   in scope for a tenant-integration SDK. A separate "admin/ops SDK" could be a later
   addition if a tenant asks for one.
2. **Not generated from the OpenAPI spec.** `docs/architecture/openapi.yaml` exists but
   these SDKs' types are hand-written to mirror the Nest DTOs directly. A generated client
   (e.g. via `openapi-typescript-codegen` or `openapi-python-client`) would eliminate the
   manual-sync risk this creates, but was not built this phase — the drift risk is
   explicitly caught only by the real e2e tests above, not by a build-time contract check.
3. **Not published to any package registry** (npm, PyPI). Both are usable today as local
   workspace/path dependencies; publishing requires organisation accounts on those
   registries and a versioning/release process, which is a Phase 10 (Commercial Launch)
   concern, not a Phase 7 one.
4. **No retry logic, no circular-breaker, no batching.** Each SDK call is a single request;
   a tenant integrating at meaningful scale would want request batching and backoff/retry
   on transient failures — left undone rather than added half-heartedly under time
   pressure.
5. **No other language SDKs** (Go, Java, Ruby, PHP, mobile/iOS/Android). The brief's "full
   SDK ecosystem" language implies more than two, but two real, tested SDKs were judged a
   more honest use of this phase's time than five thin, untested ones.

## Consequences
Tenants integrating in Node/TypeScript or Python get a real, tested client rather than
having to hand-roll HTTP calls against the ingestion endpoint. The gaps above — most
importantly, no generated-from-spec type safety and no published package — are the concrete
list a future phase (or the first real tenant integration) should work through before
calling this "SDK ecosystem" complete.
