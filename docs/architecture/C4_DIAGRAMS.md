# C4 Diagrams — Level 1 (Context) & Level 2 (Container)

Rendered as Mermaid; paste into any Mermaid-capable viewer (Confluence's Mermaid macro,
GitHub's native Mermaid rendering, or `docs/confluence/` exports).

## Level 1 — System Context

```mermaid
C4Context
title GeoGuard AI — System Context (Phase 2 MVP scope)

Person(analyst, "Trust & Safety Analyst", "Reviews flagged accounts, appeals, investigations")
Person(devops, "Tenant Developer", "Integrates the risk API/SDK into their app")
Person(enduser, "End Customer (of the tenant)", "Indirect stakeholder — never talks to GeoGuard directly")

System_Boundary(geoguard, "GeoGuard AI Platform") {
  System(core, "GeoGuard Core Risk Platform", "Ingests signals, scores risk, evaluates policy, manages appeals")
}

System_Ext(tenantApp, "Tenant Application", "Streaming/SaaS/gaming/telecom app calling GeoGuard's API/SDK")
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
Rel(enduser, tenantApp, "Uses the subscription/service", "n/a — no direct relationship with GeoGuard")
```

## Level 2 — Containers (Phase 2 MVP)

```mermaid
C4Container
title GeoGuard AI — Container Diagram (MVP)

Person(analyst, "Trust & Safety Analyst")
System_Ext(tenantApp, "Tenant Application")

System_Boundary(geoguard, "GeoGuard AI Platform") {
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

## Not yet in scope (Phase 3–5 containers, shown for roadmap context only)

Feature Store, Event Stream (Kafka-compatible), ML Scoring Service (Python/FastAPI),
Model Registry, Graph Database (fraud graph) are deliberately **absent** from the MVP
container diagram above — see ADR-0002 and Phase 0 §M/N. They will be added to this
document, not silently introduced into code, when their phase begins.
