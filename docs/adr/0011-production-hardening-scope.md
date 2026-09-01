# ADR-0011: Phase 9 Production Hardening — scope and what's genuinely done

## Status
Accepted (Phase 9).

## Context
The master brief scopes Phase 9 as TLS, secrets management, SBOM/SAST/DAST, and
incident-response runbooks. This sandbox cannot provision real TLS-terminating
infrastructure or a real cloud secrets manager — there is no load balancer, no cloud
account, no certificate authority reachable here. This phase does the parts that are
genuinely achievable and verifiable (SBOM, a real SAST pass with honest triage, a small
real DAST-style smoke test, incident-response runbooks tied to real endpoints — including
one endpoint, API-key management, that did not exist until this phase closed a gap the
runbook exposed) and documents the infrastructure-dependent parts as design-only.

## Decision

### 1. SBOM generation (done, real)
`npm run sbom` in both `apps/api` and `apps/web` runs `@cyclonedx/cyclonedx-npm`, producing
a real CycloneDX 1.6 SBOM (679 components for the API, at time of writing) from the actual
installed dependency tree — not a hand-maintained list. Wired into
`.github/workflows/ci.yml` as a build step whose output is uploaded as a CI artifact
(90-day retention), not committed to the repo (an SBOM goes stale the moment a dependency
bumps; a CI-generated one is always current for the commit it was built from).

### 2. SAST (done, real, honestly triaged)
`npm run lint:security` runs `eslint-plugin-security`'s recommended rule set against
`apps/api/src`. The run found 28 warnings, **all** `detect-object-injection`
(a rule with a well-known high false-positive rate on TypeScript code). Each distinct
pattern was manually checked against the actual data flow:
- Fixed-string header/object keys (`request.headers[API_KEY_HEADER]`) — safe, the key is a
  compile-time constant, never attacker-influenced.
- TypeScript-enum-typed keys (`DEFAULT_ROLE_PERMISSIONS[role]` where `role: TenantRole`,
  or values read back from a DB column itself constrained by a Postgres enum) — safe, the
  key space is closed at the type/schema level, not arbitrary attacker input.
- Numeric array indices in the ML training loop (`logistic-regression.ts`) — safe, bounded
  loop counters, not attacker-controlled strings.
- DTO-validated string keys (e.g. `weights[s.derivedCountry]` where the value is an
  ISO-3166 alpha-2 code either validated by `class-validator` or produced internally by the
  IP-intelligence provider) — safe; a `__proto__`-shaped key is not a valid 2-letter
  country code and would already be rejected upstream, but see the "real DAST-style
  test" below for a `__proto__` case exercised directly against a live endpoint rather
  than reasoned about statically.
Zero of the 28 findings required a code change. The check is wired into CI as an
**informational, non-blocking** step (`continue-on-error: true`) rather than a hard gate,
because the rule's false-positive rate on this codebase's style (TypeScript, enum-narrowed
keys, DTO validation) makes a raw warning-count gate more noise than signal; a new finding
still shows up in CI output for human review on every PR.

### 3. A real "DAST-style" smoke test (done, real, found and fixed one real bug)
`apps/api/test/security-smoke.e2e-spec.ts` fires SQL-injection-shaped, `__proto__`,
oversized, XSS-shaped, mass-assignment, and malformed-enum payloads at a real running
instance of the ingestion endpoint and asserts the platform degrades safely (a real 4xx,
never an unhandled 500). This is explicitly **not** a substitute for a real DAST scanner
(OWASP ZAP, Burp Suite) or a professional penetration test — it is a small, targeted,
codebase-specific complement to the existing `class-validator` whitelist validation.

**Found and fixed a real bug**: an oversized JSON body (over Express's default 100kb
`body-parser` limit) threw `PayloadTooLargeError` — a plain `Error` with a `.status = 413`
that is not a NestJS `HttpException` — which `GlobalExceptionFilter` was mapping to a
generic 500 instead of passing through the real, safe 413. Fixed: the filter now passes
through any non-`HttpException` error's own 4xx status when present, still falling back to
a detail-free 500 for anything without a safe status to report (see the updated comment in
`apps/api/src/common/filters/http-exception.filter.ts`).

### 4. Incident-response runbooks (done, real, found and fixed a real gap)
`docs/security/INCIDENT_RESPONSE.md` — four runbooks (compromised API key, compromised
dashboard account, suspected tenant-isolation breach, ingestion DoS), each tied to actual
endpoints and cross-referenced to the e2e test proving that endpoint works.

Writing Runbook 1 (compromised API key) surfaced a real, previously-unaddressed gap:
`apiKeys.revokedAt` existed in the schema and was checked by `ApiKeyGuard`, but **no
endpoint ever set it** — there was no way to revoke a compromised API key without a direct
database edit. Fixed this phase: `GET/POST /tenants/api-keys` and
`POST /tenants/api-keys/:keyPrefix/revoke` (ADMIN-only, gated by a new `api-keys:manage`
permission on the existing Phase 6 RBAC system), proven end-to-end in
`apps/api/test/api-key-management.e2e-spec.ts` (create → the new key actually works against
real ingestion → list without ever exposing the hash → revoke → the same key immediately
gets a real 401 → a non-ADMIN gets a real 403).

### 5. Stale documentation corrected
`SECURITY.md`, `PRIVACY.md`, and `CONTRIBUTING.md` referred to "the Prisma schema"/"Prisma's
parameterized query builder" — a holdover from before ADR-0005 (Phase 2) switched to
Drizzle. Corrected to reflect the actual, current data layer.

## What is genuinely tested (not asserted, verified)
- SBOM: `npm run sbom` was actually run in both apps during this phase and produced a valid
  CycloneDX document (verified structurally, not just "the command exited 0").
- SAST: the full 28-finding output was read and each distinct sink pattern traced to its
  actual data-flow origin, not skimmed.
- The 413-vs-500 fix: `security-smoke.e2e-spec.ts`'s oversized-body case failed (asserting
  the bug) before the filter fix and passes after it; the full existing e2e suite (47 tests
  across 12 suites before this endpoint addition, 53 across 13 after) passes unchanged.
- API-key management: every case in `api-key-management.e2e-spec.ts` runs against a real
  Postgres-backed app instance, including actually using the newly created key against the
  real ingestion endpoint and confirming a revoked key is really rejected by
  `ApiKeyGuard`, not just that the database row changed.

## What is explicitly NOT done, and why
1. **No real TLS termination.** This sandbox has no load balancer or reverse proxy to
   configure; `SECURITY.md` already states "TLS required for all external traffic" as a
   requirement, but no infrastructure exists here to demonstrate it. A real deployment
   needs this wired at the ingress/load-balancer layer (e.g. an ALB/NLB with an ACM
   certificate, or an nginx/Caddy reverse proxy with Let's Encrypt) before this platform
   handles real traffic.
2. **No managed secrets manager integration.** `.env`/environment variables remain the
   only secret-delivery mechanism modeled here. A real deployment should use AWS Secrets
   Manager, GCP Secret Manager, HashiCorp Vault, or equivalent, with the application reading
   secrets at boot rather than from plain environment variables — not implemented, since it
   requires a real cloud account this sandbox doesn't have.
3. **No container image scanning** (e.g. Trivy/Grype against the built Docker images in
   `infra/docker/`). SBOM generation covers the npm dependency tree, not the base OS image
   layers.
4. **No real DAST scanner run** (OWASP ZAP baseline scan or equivalent) — the smoke test
   above is real but narrow (11 specific payload shapes against one endpoint), not a
   scanner's broad automated crawl-and-attack coverage.
5. **No formal third-party penetration test.** Still explicitly out of scope per
   `docs/architecture/THREAT_MODEL.md`'s "Explicitly deferred to later phases" line.
6. **No password-reset-forcing endpoint, no SIEM/alerting integration, no on-call/paging
   system** — see `docs/security/INCIDENT_RESPONSE.md`'s "Known gaps" section for the full
   list of what the incident-response runbooks do not cover.

## Consequences
Two real bugs were found and fixed by actually exercising the running application under
adversarial-shaped input rather than only reasoning about the code (the 413-vs-500 filter
gap, and the missing API-key revocation endpoint) — consistent with this project's
load-testing (Phase 8) experience that real exercise finds real bugs static review misses.
The infrastructure-dependent hardening work (TLS termination, secrets manager, container
scanning, a real DAST scanner run, penetration testing) is listed explicitly as a
pre-production checklist rather than silently assumed handled.
