---
title: "Security Architecture"
space: "GeoGuard AI Engineering"
parent: "Architecture"
labels: ["security"]
source: "docs/architecture/SECURITY_ARCHITECTURE.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Security Architecture — Phase 2 MVP

## Trust boundaries

1. **Public internet ↔ API Gateway (NestJS `main.ts`).** TLS-terminated at the load balancer
   (Phase 9 deployment concern; local dev is plain HTTP). `helmet` sets baseline security
   headers; `cors` restricts browser-origin callers to `CORS_ALLOWED_ORIGINS`.
2. **Tenant application ↔ Ingestion API.** Authenticated via a per-tenant API key
   (bcrypt-hashed at rest; format `gg_live_<tenantPrefix>_<secret>` so a leaked key is at
   least identifiable/revocable per tenant without a DB lookup).
3. **Dashboard user ↔ API.** Authenticated via email/bcrypt-hashed-password login issuing a
   short-lived JWT; every request re-derives the user's role from the DB-backed session
   record referenced by the JWT's subject claim (not solely from claims embedded in the
   token), so a role downgrade takes effect before the token's nominal expiry on any
   request that re-checks it.
4. **API ↔ PostgreSQL.** All access via Drizzle/`pg`'s connection pool over TLS in any non-local
   environment; no service is granted a superuser DB role — a dedicated `geoguard_app` role
   with only the privileges the schema requires is the target for Phase 9 hardening (local
   dev uses a single dev-only role for simplicity, documented as a gap, not hidden).
5. **API ↔ Valkey.** Used only for rate-limit counters and cached derived features — no
   personal data more sensitive than what's already in Postgres is stored there, and cache
   entries carry the same tenant-scoping key prefix (`tenant:<id>:...`) as a defense-in-depth
   measure against a cache-layer cross-tenant bug.

## Defense in depth for multi-tenant isolation

Three independent layers, deliberately redundant:
1. **Application layer:** every service method requires an explicit `tenantId` parameter and
   every Drizzle query filters on it (no "get all" method exists without it) — a convention
   enforced by code review rather than a generic repository base class; see the trade-off
   rationale in ADR-0003 and the comment in `apps/api/src/db/db.module.ts`.
2. **Guard layer:** `ApiKeyGuard` and `JwtAuthGuard` each resolve the authenticated
   principal's tenant once per request and attach it to `request.authContext`; the
   `@CurrentTenant()` param decorator (`apps/api/src/common/decorators/current-tenant.decorator.ts`)
   is the only sanctioned way a controller reads a tenant ID — controllers never read a
   tenant ID from client-supplied input (path/body) for authorization decisions.
3. **Test layer:** `apps/api/test/tenant-isolation.e2e-spec.ts` seeds two tenants and asserts,
   for every resource type, that Tenant A's credentials cannot read or write Tenant B's data.

Database-level row-level security (Postgres `RLS` policies keyed on `tenant_id`) is noted
in ADR-0002 as a selection rationale but is **not yet turned on** in the MVP migration — it
is tracked as a Phase 2 follow-up hardening task, listed here rather than silently assumed
done, since claiming a control that isn't active would violate the project's own
engineering-quality rules.

## Data residency

MVP reference deployment target: a single EU region (exact provider/region is an infra
decision for Phase 8/9, deliberately not pinned here). `Tenant.dataResidency` is modeled as
an enum (`EU`, `OTHER`) from the start so the constraint is representable even before
multi-region deployment exists, matching the "Data residency: EU" line in the user's own
Privacy Control Center sketch (Phase 0 discovery doc).

## What this document does not cover yet

Secrets-manager integration, container/image scanning, SAST/DAST, WAF/CDN edge protection,
and formal incident-response runbooks are Phase 9 (Production Hardening) deliverables.
