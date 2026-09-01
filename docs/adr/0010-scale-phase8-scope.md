# ADR-0010: Phase 8 Scale — scope, real load-test findings, and what's design-only

## Status
Accepted (Phase 8).

## Context
The master brief scopes Phase 8 as multi-region/HA design, a dedicated scoring service, and
load testing. This repository has, until now, only ever run as one API process against one
Postgres instance in a single sandboxed container — there is no multi-region infrastructure
to actually deploy to here, and pretending otherwise would violate this project's
anti-placeholder discipline. This phase instead does the two things that ARE genuinely
achievable and verifiable in this environment: real load testing against the real
application (which found and fixed a real bug), and an honest design document for the
scaling work that requires infrastructure this sandbox doesn't have.

## Decision

### 1. Real load testing (done, with real results)
`apps/api/scripts/load-test-ingestion.ts` boots a real instance of the API (real Postgres,
real HTTP, real auth) and drives it with [autocannon](https://github.com/mcollina/autocannon).
See `docs/performance/PHASE_8_LOAD_TEST.md` for the full run-by-run results. Headline: this
found and led to fixing **a genuine concurrency bug** —
`AccountsService.findOrCreateEndAccount`/`findOrCreateDevice` did a check-then-act
select-then-insert that raced under concurrent requests for the same account/device,
producing unhandled 500s under real load. Both are now atomic
`INSERT ... ON CONFLICT DO UPDATE` statements.

### 2. Configurable capacity knobs (done)
- `DB_POOL_MAX` / `DB_POOL_IDLE_TIMEOUT_MS` (`src/db/db.module.ts`): the Postgres pool size
  was previously `pg`'s undocumented default of 10; now tunable per replica, default 20.
- `RISK_INGESTION_RATE_LIMIT` (`src/risk/risk.controller.ts`): the ingestion rate limit was
  hardcoded to 100/60s; now tunable per deployment without a code change.

### 3. Health endpoints for a load balancer/orchestrator (done)
`GET /healthz` (liveness, pre-existing since Phase 2) and `GET /healthz/ready` (new — a real
`SELECT 1` against Postgres) — see `apps/api/src/health.controller.ts` and
`apps/api/test/health.e2e-spec.ts`.

### 4. Multi-region/HA and dedicated scoring service — design-only
Not deployed, not deployable in this sandbox (one container, one Postgres instance, no
cloud account, no orchestrator). What this ADR documents instead, honestly labeled as design
intent rather than working infrastructure:

- **Multi-region**: the reference deployment target (per
  `docs/architecture/SECURITY_ARCHITECTURE.md` "Data residency") is a single EU region. A
  real multi-region rollout would need: a read-scaling strategy for Postgres (logical
  replication or a managed multi-region Postgres offering), a decision on whether tenant
  data is region-pinned (likely yes, given the GDPR data-residency commitments in
  `docs/architecture/GDPR_DATA_MAP.md`) or replicated, and a load-balancing/routing layer
  that keeps a tenant's traffic in its assigned region. None of this is built; it requires
  real cloud infrastructure this sandbox cannot provision.
- **Dedicated scoring service**: ADR-0006 already deferred extracting `src/ml/` into a
  separate service; this phase's load test gives a concrete, current data point against
  that decision — the in-process rule engine adds negligible latency compared to the
  multiple sequential Postgres round-trips per request (see
  `docs/performance/PHASE_8_LOAD_TEST.md` Run 2) — so extracting scoring into its own
  service would not, on today's evidence, fix the actual bottleneck (DB round-trip count).
  A future phase should re-run this load test before deciding to extract scoring, not
  extract it on schedule alone.

## What is genuinely tested (not asserted, verified)
- The concurrency fix: `apps/api/test:e2e:reset` (all 11 suites / 36 tests) passes
  unchanged after the fix, and the real load test in
  `docs/performance/PHASE_8_LOAD_TEST.md` Run 2 shows 0 errors / 0 non-2xx at raised
  concurrency where Run 1 (pre-fix) showed 22,445 failures.
- The rate limiter: Run 3 shows exactly 200 successful requests over a ~70s window against
  the default 100/60s limit — confirms the limiter rejects overage with 429s, not silent
  failures or crashes.
- The readiness endpoint: `apps/api/test/health.e2e-spec.ts` proves `GET /healthz/ready`
  returns 200 against a real, reachable Postgres connection.

## What is explicitly NOT done, and why
1. **No graceful-shutdown drain.** `main.ts` has no SIGTERM handler that stops accepting
   new connections and waits for in-flight requests before closing the DB pool. A real
   rolling deploy or autoscaling scale-down could cut off an in-flight request mid-write.
   Found as a side-effect of building the load-test harness itself (see
   `docs/performance/PHASE_8_LOAD_TEST.md` "A second real gap") — not fixed this phase, to
   keep this ADR's scope to what was actually verified rather than layering an unverified
   shutdown-hook change on top.
2. **Rate limiting is per-replica, not cluster-wide.** `@nestjs/throttler`'s default
   in-memory storage means `RISK_INGESTION_RATE_LIMIT` is enforced independently by each
   running API process. A real horizontally-scaled deployment needs a shared store (e.g.
   `@nestjs/throttler`'s Redis storage adapter, backed by the Valkey container this
   platform's own C4 diagram already includes) — not implemented.
3. **Rate limiting is tracked by IP, not by tenant/API key.** Multiple tenants behind the
   same NAT/corporate proxy would share a rate-limit bucket; a single tenant load-balanced
   across multiple egress IPs gets a looser effective limit than intended. A correct fix
   needs a custom `ThrottlerGuard` tracker keyed by the authenticated tenant, which runs
   into guard-ordering complexity (the global `ThrottlerGuard` currently runs before the
   route-level `ApiKeyGuard` populates `request.authContext`) — flagged, not solved.
4. **No real multi-region or multi-replica deployment was tested.** This project has never
   run as more than one process; see "Multi-region/HA... design-only" above.
5. **No read replica, no PgBouncer/connection pooler.** `DB_POOL_MAX` makes the existing
   single-instance pool tunable but does not add read/write splitting or pooling
   middleware.
6. **The "dedicated scoring service" extraction was evaluated, not performed** — see
   point 4 in the Decision section for the reasoning.

## Consequences
A real, previously-invisible concurrency bug is fixed with load-test evidence, not just
inspection. Capacity-relevant configuration (pool size, rate limit) no longer requires a
code change to tune. The genuinely infrastructure-dependent scaling work (multi-region,
distributed rate limiting, graceful shutdown, connection pooling middleware) is listed
explicitly rather than silently assumed handled, so a future phase — or a real production
rollout — has a concrete checklist instead of a vague "Phase 8 done" claim.
