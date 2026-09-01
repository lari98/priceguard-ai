---
title: "Incident Response Runbooks"
space: "PriceGuard AI Engineering"
parent: "PriceGuard AI Engineering"
labels: ["security"]
source: "docs/security/INCIDENT_RESPONSE.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Incident Response Runbooks (Phase 9)

Concrete, executable runbooks tied to this codebase's actual endpoints — not a generic
incident-response template. Each runbook below has been exercised against a real running
instance of the API (see the linked e2e test for each). This document covers the incident
classes this platform can genuinely respond to today; it does **not** cover incidents this
platform has no tooling for yet (see "Known gaps" at the bottom — read that section before
assuming a class of incident is handled).

## Before you need this document

- All actions below require a dashboard ADMIN account with a valid JWT (`POST /auth/login`).
- `docs/adr/0008-enterprise-compliance-scope.md` and `docs/adr/0011-production-hardening-scope.md`
  are the design records behind the session-revocation and API-key-management capabilities
  this runbook uses — read them for what these mechanisms do and don't cover.
- None of these actions require SSH/database access. If you find yourself reaching for a
  direct SQL query to do something described below, use the API endpoint instead — it goes
  through the same audit-logging (`audit_log_entries`) and validation as everything else.

## Runbook 1: A tenant's API key is suspected compromised (leaked in a log, a public repo, a support ticket screenshot)

**Goal:** stop the leaked key from working immediately, then issue a replacement.

1. Confirm which key: `GET /tenants/api-keys` (ADMIN JWT) lists every key for the tenant by
   `keyPrefix` (never the secret or hash) with `createdAt`/`revokedAt`. The `keyPrefix` is
   what appears in the leaked material (it's the human-visible part of
   `<prefix>.<secret>`), so you can identify the right row without ever needing the secret.
2. Revoke it: `POST /tenants/api-keys/:keyPrefix/revoke` (ADMIN JWT). This sets
   `revokedAt` immediately; `ApiKeyGuard` checks `revokedAt` on every request, so the very
   next request using that key gets a real 401 — proven by
   `apps/api/test/api-key-management.e2e-spec.ts`'s
   "revoking a key makes it immediately fail real API-key auth" case.
3. Issue a replacement: `POST /tenants/api-keys` (ADMIN JWT) returns
   `{ keyPrefix, apiKey, createdAt }` — `apiKey` (the full `<prefix>.<secret>`) is shown
   **exactly once**, in this response only; it is never retrievable again. Get it to the
   tenant's engineering contact through a channel that isn't the one that leaked the last
   one.
4. Confirm the tenant's integration has rolled the new key before you consider this closed
   — revoking the old key without confirming the new one is live will cause their real
   ingestion traffic to start failing.

**What this does NOT do**: it does not identify *how* the key leaked, does not rotate any
other credential the tenant may have exposed alongside it, and does not notify the tenant
automatically — steps 3–4's "get it to them" and "confirm they've rolled it" are manual
today.

## Runbook 2: A dashboard user's account is suspected compromised (credential stuffing hit, a user reports unrecognized activity, an offboarded employee's account)

**Goal:** invalidate every existing session for that account immediately.

1. If the affected user still has access and can act themselves:
   `POST /auth/logout-all` (their own JWT) bumps their own `tokenVersion`, invalidating
   every previously issued token for their account — including the session the attacker
   may be using, and including the browser tab making this very call (they'll need to log
   in again).
2. If the affected user does NOT have access (their account is the one that needs locking
   out — e.g. an offboarded employee, or a user who can't act themselves):
   `POST /auth/users/:userId/revoke-sessions` (a different ADMIN's JWT) does the same
   `tokenVersion` bump on their behalf. Proven end-to-end (real sessions minted, one
   revoked, the sibling still works, then the admin-forced revocation invalidates both) in
   `apps/api/test/rbac-and-sessions.e2e-spec.ts`.
3. For a single suspicious session (not the whole account) where you have that session's
   own token: `POST /auth/logout` invalidates only that one token via the `jti` blocklist,
   leaving the account's other sessions untouched — use this when you don't want to force
   every legitimate session to re-authenticate.
4. This platform has no password-reset-forcing endpoint yet (see "Known gaps"). If the
   account's password itself is suspected compromised (not just a stolen token), the
   password must be changed through whatever out-of-band process currently exists — session
   revocation alone does not stop a new login with the same (compromised) password.

## Runbook 3: A tenant reports data they believe shouldn't be visible to them (possible tenant-isolation bug)

**Goal:** confirm or rule out cross-tenant data exposure quickly, without guessing.

1. This is exactly what `apps/api/test/tenant-isolation.e2e-spec.ts` exists to prevent —
   re-run it (`npm run test:e2e:reset`, filtering to that spec) against the current `main`
   as the first step. If it fails, you have a real regression and a reproduction already in
   hand; stop and fix the underlying query (see ADR-0003's tenant-scoping convention — every
   query must filter on `tenantId`).
2. If the suite passes, the specific report needs manual reproduction: identify the exact
   endpoint and resource ID the tenant says they saw, and check that endpoint's service
   method for a missing `eq(table.tenantId, tenantId)` predicate (grep the file for the
   query in question — this codebase does not use a generic repository base class, so every
   query's tenant scoping is visible directly at the call site, per ADR-0003).
3. Check `audit_log_entries` for the resource in question (`GET` isn't currently exposed for
   ad-hoc audit querying beyond the dashboard's own Audit Log page — use that page, filtered
   by the resource's tenant and approximate timeframe) to establish what was actually
   accessed and by whom, for the incident record.

## Runbook 4: Suspected denial-of-service against the ingestion endpoint

**Goal:** confirm the rate limiter is holding, and know its real limits.

1. Real-load-tested behavior (`docs/performance/PHASE_8_LOAD_TEST.md`): `POST
   /v1/risk/events` returns 429 past `RISK_INGESTION_RATE_LIMIT` (default 100) requests per
   60 seconds — **per API process, tracked by source IP**, not per tenant (see ADR-0010's
   known gap). If traffic is coming from many source IPs (a real distributed attack) or the
   platform runs multiple replicas, the effective aggregate limit is higher than the
   configured number suggests — this is a known, documented limitation, not a
   surprise-in-the-moment discovery.
2. Raising or lowering the limit is a deployment-config change
   (`RISK_INGESTION_RATE_LIMIT` env var), not a code change — no redeploy of application
   logic needed, only a config/restart.
3. This platform has no edge/CDN-level DDoS protection (see `SECURITY.md` and
   `docs/architecture/THREAT_MODEL.md` row 7) — a real volumetric attack needs a mitigation
   layer in front of this API, not inside it.

## Known gaps (do not assume these are handled)

- **No password-reset-forcing endpoint.** Session revocation (Runbook 2) does not stop a
  new login with a compromised-but-still-valid password.
- **No automated tenant/user notification** on any of the above actions — telling the
  affected party is a manual step today.
- **No SIEM/alerting integration.** Nothing in this platform proactively pages anyone;
  every runbook above assumes a human already knows to act (from a support ticket, a
  monitoring alert outside this codebase, or a manual audit-log review).
- **No graceful-shutdown drain** (ADR-0010) — an in-flight request during a deploy can be
  cut off mid-write; this is unrelated to security incidents but is the kind of thing that
  can look like one (a request that "silently disappeared") if not known in advance.
- **No formal on-call rotation or paging system** — this document assumes whoever is
  reading it already has ADMIN dashboard access and authority to act.
