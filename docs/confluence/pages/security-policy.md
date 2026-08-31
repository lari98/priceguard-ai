---
title: "Security Policy"
space: "PriceGuard AI Engineering"
parent: "Governance & Process"
labels: ["security", "governance"]
source: "SECURITY.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Security Policy

## Reporting a vulnerability

Do not open a public GitHub issue for a suspected security vulnerability. Instead, email
**security@[project-domain-tbd]** with a description, reproduction steps, and impact
assessment. You will receive an acknowledgement within 3 business days. This address and
SLA are placeholders until the project has a registered domain and a staffed security
inbox — tracked as an open item for Phase 9 (Production Hardening).

## Supported versions

Pre-1.0.0, only the `main` branch is supported. Once v1.0.0 ships, this section will list
the semantic-versioning support policy (see `CHANGELOG.md` for the versioning scheme).

## Security architecture (summary — full detail in `docs/architecture/SECURITY_ARCHITECTURE.md`)

- **Transport:** TLS required for all external traffic; local development uses plain HTTP only on `localhost`.
- **AuthN/AuthZ:** dashboard users authenticate via password (bcrypt-hashed) + JWT session; server-to-server callers authenticate via bcrypt-hashed API keys scoped to a single tenant. Role-based access control (RBAC) is enforced via a NestJS guard on every route; a tenant-isolation guard independently enforces that the authenticated principal's `tenantId` matches the resource being accessed, as defense-in-depth alongside row-level query scoping.
- **Input validation:** every inbound DTO is validated with `class-validator` (whitelist mode — unknown properties rejected) before reaching business logic, mitigating injection and mass-assignment classes of bugs.
- **SQL injection:** all database access goes through Prisma's parameterized query builder; raw SQL is not used in application code.
- **SSRF:** any future outbound enrichment call (e.g., to an IP-intelligence provider) must go through an allowlisted egress helper — not implemented in the MVP because no outbound enrichment call exists yet; documented here so it is not forgotten when Module A (IP Intelligence) is integrated.
- **Rate limiting:** `@nestjs/throttler` is applied globally and more tightly on the ingestion and auth endpoints.
- **Secrets:** never committed; `.env.example` documents required variables with placeholder values only; local secrets live in `.env` (gitignored); production secret storage is a Phase 9 deliverable (a managed secrets manager, not `.env` files).
- **Dependency/container scanning:** `.github/workflows/ci.yml` runs `npm audit` and a Dependabot configuration keeps dependencies current; SAST/DAST/SBOM generation and container scanning are scheduled for Phase 9 hardening, not yet wired into CI.
- **Audit logging:** every risk decision, policy change, and appeal outcome is written to an append-only `audit_log` table with actor, tenant, timestamp, and before/after state.

## Known gaps (do not treat this project as security-complete)

SSO/SAML/OIDC/MFA, ABAC, webhook signing, IP allowlisting per tenant, SAST/DAST, SBOM
generation, and formal penetration testing are **not yet implemented** — they are Phase 6
and Phase 9 deliverables per the project roadmap. Do not represent this codebase as
enterprise-security-complete until those phases close.
