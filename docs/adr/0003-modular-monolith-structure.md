# ADR 0003: Modular Monolith, Not Microservices, for the MVP

## Context
Master brief §24 says "avoid unnecessary microservices. Start with a modular architecture
that can scale." The domain has natural future service boundaries (risk scoring, policy,
fraud graph, ML) but none of them yet have independent scaling, deployment, or team-ownership
requirements that would justify the operational cost of separate services.

## Decision
Build a single NestJS application (`apps/api`) organized into strictly-bounded modules that
mirror the eventual service boundaries:

```
apps/api/src/
  tenant/        Tenant, TenantUser, ApiKey
  auth/          JWT (dashboard) + API key (server-to-server) guards
  accounts/      EndAccount, Device, Session, PaymentSignal
  risk/          RiskEvent ingestion, RuleEngine, RiskScore
  policy/        Policy, Rule, PolicyDecision evaluation
  investigations/ Investigation, Appeal
  audit/         AuditLogEntry (write-only service, read via a narrow query API)
  retention/     RetentionPolicy + scheduled deletion job
  common/        guards, interceptors, decorators, DTO base classes
```

> **Note (updated after implementation):** this ADR originally proposed a generic
> `TenantScopedRepository` base class in `common/` as the mechanism for tenant isolation.
> During implementation that was deliberately replaced with a narrower pattern — every
> service method takes an explicit `tenantId` parameter and every Drizzle query filters on
> it directly, verified end-to-end by `apps/api/test/tenant-isolation.e2e-spec.ts` — because
> Drizzle (adopted in ADR-0005, after Prisma was dropped) is a query builder, not an ORM
> with a repository abstraction layer, and a hand-rolled generic wrapper around it would
> have added an abstraction the MVP's module count doesn't yet justify. See the rationale
> comment in `apps/api/src/db/db.module.ts`.

Each module exposes a narrow public interface (its `*.service.ts` public methods); modules
do not reach into each other's Drizzle tables directly — they call the owning module's
service. This makes a future extraction (e.g., `risk/` becoming its own service consuming
a message queue) a matter of replacing in-process calls with network calls, not a rewrite
of business logic.

## Alternatives considered
- **Separate services per module from day one.** Rejected: no current requirement
  (independent scaling, independent deploy cadence, separate team) justifies the added
  operational complexity (service discovery, distributed tracing, network failure modes)
  for an MVP with a single small team.
- **Fully flat, unmodularized NestJS app.** Rejected: would make the eventual extraction
  (Phase 5 fraud graph, Phase 4 ML service) much more expensive, and makes tenant-isolation
  review harder (no clear module boundary to audit).

## Advantages
Single deployable unit for MVP (simpler CI/CD, one Postgres connection pool, one process to
monitor); module boundaries are enforced by code review and (long-term) lint rules
(`eslint-plugin-boundaries`, to be added when the module count grows) rather than network
calls, which is cheaper for a small team; extraction path to services is a refactor, not a
rewrite.

## Disadvantages
No independent scaling of, e.g., the risk-scoring path under heavy ingestion load without
scaling the whole API process; a bug in one module can, in principle, affect the whole
process's availability (mitigated by the module boundary discipline above, not eliminated).

## Security implications
A single process means a single attack surface to hardened (one set of dependencies, one
set of exposed ports) rather than several — simpler to reason about for the MVP's threat
model (`docs/architecture/THREAT_MODEL.md`).

## Privacy implications
None beyond what's already covered in `docs/architecture/GDPR_DATA_MAP.md`; module
boundaries do make it easier to audit "which code touches personal data" per module.
