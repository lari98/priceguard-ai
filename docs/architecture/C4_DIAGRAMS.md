# C4 Diagrams — Level 1 (Context) & Level 2 (Container)

Rendered as Mermaid; paste into any Mermaid-capable viewer (Confluence's Mermaid macro,
GitHub's native Mermaid rendering, or `docs/confluence/` exports).

## Level 1 — System Context

```mermaid
C4Context
title PriceGuard AI — System Context (Phase 2 MVP scope)

Person(analyst, "Trust & Safety Analyst", "Reviews flagged accounts, appeals, investigations")
Person(devops, "Tenant Developer", "Integrates the risk API/SDK into their app")
Person(enduser, "End Customer (of the tenant)", "Indirect stakeholder — never talks to PriceGuard directly")

System_Boundary(priceguard, "PriceGuard AI Platform") {
  System(core, "PriceGuard Core Risk Platform", "Ingests signals, scores risk, evaluates policy, manages appeals")
}

System_Ext(tenantApp, "Tenant Application", "Streaming/SaaS/gaming/telecom app calling PriceGuard's API/SDK")
System_Ext(psp, "Tenant's Payment Processor", "Shares only tokenized/derived payment-country signals, never raw card data")
System_Ext(ipintel, "Third-party IP Intelligence Provider", "VPN/proxy/ASN reputation lookups (pluggable, Module A/B)")
System_Ext(idv, "Third-party Identity/KYC Provider", "Pass/fail verification result only, per data-minimisation design")

Rel(tenantApp, core, "Sends risk events, receives risk decisions", "HTTPS/REST, SDK")
Rel(core, tenantApp, "Delivers async decisions/updates", "Webhook, signed")
Rel(psp, core, "Provides tokenized payment-country signal", "HTTPS/REST, tenant-configured")
Rel(core, ipintel, "Looks up IP reputation/ASN/VPN likelihood", "HTTPS/REST")
Rel(core, idv, "Requests identity/residency verification result", "HTTPS/REST")
Rel(analyst, core, "Reviews risk events, approves/rejects appeals", "Admin dashboard, HTTPS")
Rel(devops, core, "Configures tenant, policies, API keys", "Admin dashboard / API")
Rel(enduser, tenantApp, "Uses the subscription/service", "n/a — no direct relationship with PriceGuard")
```

## Level 2 — Containers (Phase 2 MVP)

```mermaid
C4Container
title PriceGuard AI — Container Diagram (MVP)

Person(analyst, "Trust & Safety Analyst")
System_Ext(tenantApp, "Tenant Application")

System_Boundary(priceguard, "PriceGuard AI Platform") {
  Container(web, "Admin Dashboard", "Next.js, TypeScript", "Overview, Risk Events, Accounts, Policy/Rules, Audit Logs, Appeals")
  Container(api, "Core API", "NestJS, TypeScript", "Tenant mgmt, auth, risk ingestion, rule engine, scoring, policy, audit, appeals — modular monolith, see ADR-0003")
  ContainerDb(pg, "PostgreSQL 18", "Relational DB", "Tenants, accounts, sessions, risk events/scores, policies, audit log — tenant_id-partitioned")
  ContainerDb(cache, "Valkey", "Redis-protocol cache", "Rate-limit counters, precomputed/cached feature values for the fast decision path")
}

Rel(analyst, web, "Uses", "HTTPS")
Rel(web, api, "Calls", "HTTPS/REST, JWT session")
Rel(tenantApp, api, "Sends events / receives decisions", "HTTPS/REST, API key")
Rel(api, pg, "Reads/writes", "Drizzle ORM, TLS")
Rel(api, cache, "Reads/writes rate-limit + cached features", "TLS")
```

## Phase 3 addition: batch feature store

`account_feature_snapshots` (`apps/api/src/analytics/feature-store.service.ts`) is a
**batch** feature store — a nightly job aggregating `risk_events`/`sessions`/`risk_scores`
into per-account daily snapshots — not the streaming Feature Store container originally
scoped for Phase 3. A real streaming platform (Kafka-compatible event stream feeding a
columnar analytics store such as ClickHouse) remains deferred until real ingestion volume
justifies the operational cost (ADR-0002, Phase 0 §M/N); this batch implementation is what
Phase 4's model training reads from in the meantime.

## Phase 4 addition: in-process ML module (not a separate service)

`apps/api/src/ml/` implements the shadow-model training/registry/evaluation/drift/rollout-
approval pipeline **in-process**, not as the separate ML Scoring Service (Python/FastAPI)
container originally scoped — see ADR-0006 for the full reasoning and, importantly, what
is explicitly *not* real yet (the approved rollout does not gate live traffic; the trained
model is illustrative-scale, not production-grade fraud ML).

## Phase 5 addition: fraud graph on Postgres (not a dedicated graph DB)

`apps/api/src/fraud-graph/` implements real connected-components clustering directly over
Postgres (`devices`/`device_account_links`/`payment_signals`) rather than the dedicated
Graph Database container originally scoped — see ADR-0007 for the full reasoning, the real
gap it found and fixed (`device_account_links`), and what's explicitly deferred (clusters
don't yet feed policy decisions; no fuzzy/similarity matching; no dedicated graph engine).

## Phase 6 addition: OIDC SSO, fine-grained RBAC, DSAR export, session revocation

`apps/api/src/sso/`, `src/rbac/`, `src/dsr/export.service.ts` — see ADR-0008 for what's
genuinely tested (a real fake-but-spec-compliant OIDC provider, not a live vendor IdP) and
what's explicitly deferred (SAML, MFA; the SSO callback returns JSON, not yet a browser
redirect into the dashboard SPA).

## Phase 7 addition: client SDKs (Node, Python) wrapping the ingestion endpoint

`sdk/node/` (`@priceguard/sdk-node`) and `sdk/python/` (`priceguard-sdk`) are thin typed
clients for `POST /v1/risk/events` — no new container, no new API surface, just first-party
client libraries a tenant's own application process calls into (replacing the `tenantApp`
box's own hand-rolled HTTP calls in the Level 1 diagram above). See ADR-0009 for what's
genuinely tested (a real, running instance of the API, not just stubbed HTTP) and what's
explicitly deferred (not OpenAPI-generated, not published to a registry, only two
languages, no retry/batching).

## Not yet in scope (roadmap context only)

Event Stream (Kafka-compatible, still deferred per ADR-0002) is still deliberately
**absent** from the container diagram above. It will be added to this document, not
silently introduced into code, when its phase begins.
