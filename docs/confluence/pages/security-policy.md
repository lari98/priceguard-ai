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

- **Transport:** TLS required for all external traffic; local development uses plain HTTP only on `localhost`. Production TLS termination is a design-only item as of Phase 9 — see `docs/adr/0011-production-hardening-scope.md`.
- **AuthN/AuthZ:** dashboard users authenticate via password (bcrypt-hashed) + JWT session, or via OIDC SSO (Phase 6, `docs/adr/0008-enterprise-compliance-scope.md`); server-to-server callers authenticate via bcrypt-hashed API keys scoped to a single tenant. Fixed-role RBAC (ADMIN/ANALYST/VIEWER) is enforced via a NestJS guard on every route, with fine-grained named-permission overrides on top (Phase 6, `src/rbac/`); a tenant-isolation guard independently enforces that the authenticated principal's `tenantId` matches the resource being accessed, as defense-in-depth alongside row-level query scoping. Session revocation (single-session logout and bulk "log out everywhere") closed a previously-flagged gap — see Phase 6.
- **Input validation:** every inbound DTO is validated with `class-validator` (whitelist mode — unknown properties rejected) before reaching business logic, mitigating injection and mass-assignment classes of bugs. Exercised by a real "DAST-style" smoke test (`apps/api/test/security-smoke.e2e-spec.ts`, Phase 9) firing SQL-injection-shaped, oversized, `__proto__`, and malformed payloads at a real running instance and asserting safe 4xx handling, not a 500.
- **SQL injection:** all database access goes through Drizzle ORM's parameterized query builder (see ADR-0005 for why Drizzle rather than the originally-scoped Prisma); raw SQL is not used in application code.
- **SSRF:** any future outbound enrichment call (e.g., to an IP-intelligence provider) must go through an allowlisted egress helper — not implemented in the MVP because no outbound enrichment call exists yet; documented here so it is not forgotten when Module A (IP Intelligence) is integrated.
- **Rate limiting:** `@nestjs/throttler` is applied globally and more tightly (and, since Phase 8, tunably via `RISK_INGESTION_RATE_LIMIT`) on the ingestion endpoint; real-load-tested (`docs/performance/PHASE_8_LOAD_TEST.md`). Known gap: enforced per-replica and tracked by IP rather than cluster-wide/per-tenant (ADR-0010).
- **Secrets:** never committed; `.env.example` documents required variables with placeholder values only; local secrets live in `.env` (gitignored); production secret storage remains a managed-secrets-manager design item, not yet implemented — see `docs/adr/0011-production-hardening-scope.md`.
- **Dependency/container scanning:** `.github/workflows/ci.yml` runs `npm audit` (blocking on high/critical) and a Dependabot configuration keeps dependencies current. As of Phase 9: SBOM generation (CycloneDX, `npm run sbom` in both `apps/api` and `apps/web`) runs in CI and is uploaded as a build artifact; a SAST pass (`npm run lint:security`, `eslint-plugin-security`) runs in CI as an informational (non-blocking) step — see ADR-0011 for why its findings are triaged rather than gated on, and for what's still not done (container image scanning, a real DAST scanner, formal penetration testing).
- **Audit logging:** every risk decision, policy change, and appeal outcome is written to an append-only `audit_log` table with actor, tenant, timestamp, and before/after state.
- **Incident response:** `docs/security/INCIDENT_RESPONSE.md` (Phase 9) — concrete runbooks tied to this codebase's actual endpoints (API key revocation, session revocation, tenant lockout) for the incident classes this platform can actually face today.

## Known gaps (do not treat this project as security-complete)

SAML and MFA (OIDC SSO and fine-grained RBAC shipped in Phase 6 — see
`docs/adr/0008-enterprise-compliance-scope.md`), container image scanning, a real DAST
scanner (OWASP ZAP/Burp — Phase 9 shipped a small custom smoke test, not a full scanner run;
see `docs/adr/0011-production-hardening-scope.md`), production TLS termination and a managed
secrets manager (both design-only as of Phase 9), and formal third-party penetration testing
are **not yet implemented**. Do not represent this codebase as enterprise-security-complete
until those are closed.
