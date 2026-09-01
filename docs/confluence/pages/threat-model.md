---
title: "Threat Model (STRIDE)"
space: "PriceGuard AI Engineering"
parent: "Architecture"
labels: ["security"]
source: "docs/architecture/THREAT_MODEL.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Threat Model (STRIDE) — Phase 2 MVP Scope

Elaborates Phase 0 §D for the concrete MVP components. Re-run this exercise (and extend
the table) at the start of every subsequent phase that adds a new container per ADR-0002/0003.

| # | Component | Threat (STRIDE) | Scenario | Mitigation (implemented / planned) |
|---|---|---|---|---|
| 1 | Ingestion API | Spoofing | Attacker forges a tenant's API key | API keys are bcrypt-hashed at rest, transmitted only over TLS, rotatable via dashboard; key prefix + secret split so a leaked log line doesn't expose the full key (implemented: `ApiKeyGuard`) |
| 2 | Ingestion API | Tampering | Malicious/compromised SDK sends fabricated device/session telemetry to manipulate its own risk score | MVP mitigation is limited (documented gap): server-side plausibility checks (e.g., timestamp skew bounds, event-type enum validation) are implemented; full anti-tampering (attestation, signed SDK telemetry) is a Phase 4/Adversarial-Resilience item (brief §32), not solved in MVP — flagged, not silently assumed solved |
| 3 | Multi-tenant data store | Information Disclosure | A query bug returns Tenant B's risk events to a Tenant A analyst | Every Drizzle query in service code is required to filter by the authenticated `tenantId` — enforced by convention plus review, not a generic repository base class (see the rationale for that trade-off in ADR-0003 and the comment in `apps/api/src/db/db.module.ts`); a dedicated integration test (`apps/api/test/tenant-isolation.e2e-spec.ts`) asserts cross-tenant reads return 404/empty, not another tenant's data |
| 4 | Admin dashboard auth | Spoofing / Elevation of Privilege | Stolen JWT reused after a role downgrade or logout | Short JWT expiry (`JWT_EXPIRES_IN`, default 8h) + role re-checked server-side on every request (not cached in the token beyond session lifetime); **implemented in Phase 6**: every JWT carries a `tokenVersion` claim checked against `tenant_users.token_version` (bulk revocation — "log out everywhere"/admin-forced revocation) plus a `jti` blocklist (`revoked_tokens`, single-session logout) — see ADR-0008 and `test/rbac-and-sessions.e2e-spec.ts` |
| 5 | Rule/Policy engine | Tampering | A tenant admin (or a compromised dashboard session) writes a policy that auto-suspends every account | `requiresHumanReview` cannot be set to `false` for any action in `{REQUEST_VERIFICATION, RESTRICT, MANUAL_REVIEW, SUSPEND, TERMINATE}` — enforced server-side in `PolicyEngineService.validateRuleInput` (throws on violation), called from `PolicyService.createPolicy` before any rule is persisted, not just a UI-level checkbox |
| 6 | Audit log | Repudiation | An analyst denies having approved an enforcement action | Every `AuditLogEntry` records `actorId`, `actorType`, `tenantId`, `action`, `beforeState`/`afterState` snapshot, and `createdAt`; the table is insert-only at the application layer (no `UPDATE`/`DELETE` service method exists for it) |
| 7 | Ingestion API | Denial of Service | Flood of fake risk events exhausts DB/compute | `@nestjs/throttler` rate limits `/v1/risk/events` (tunable via `RISK_INGESTION_RATE_LIMIT`, Phase 8), real-load-tested (`docs/performance/PHASE_8_LOAD_TEST.md`) confirming 429 rejection past the limit; **known gap, tracked by IP not tenant/API key, and enforced per-replica not cluster-wide** (ADR-0010) — not a substitute for edge/CDN-level DDoS protection (Phase 9 item) |
| 8 | Any future outbound enrichment call | SSRF | A malicious or malformed URL/host causes the server to make requests to internal infrastructure | No outbound enrichment exists in the MVP (see ADR-0002 — IP-intelligence integration is a documented Phase 2/3 follow-up, not built yet); this row exists so the control (egress allowlist) is designed in before that code is written, not after |
| 9 | Dependency supply chain | Tampering | A compromised npm dependency introduces malicious code | `npm audit` runs in CI; Dependabot opens weekly update PRs; **as of Phase 9**: real CycloneDX SBOM generation runs in CI (uploaded as a build artifact), a SAST pass (`eslint-plugin-security`) runs informationally in CI with its 28 findings triaged (all false positives — ADR-0011), and a small real "DAST-style" smoke test (`security-smoke.e2e-spec.ts`) found and fixed a genuine 413-vs-500 bug; container image scanning and a full DAST scanner run remain not implemented (ADR-0011) |
| 10 | Appeals workflow | Elevation of Privilege | An end-customer's appeal submission is used as an injection vector into analyst tooling (e.g., stored XSS in the dashboard) | Appeal free-text fields are stored as-is but rendered in the Next.js dashboard through React's default escaping (no `dangerouslySetInnerHTML` used anywhere in `apps/web`); the submission path itself is covered by `apps/api/test/appeals.e2e-spec.ts` |

## Explicitly deferred to later phases (not solved by this document or the MVP code)

Adversarial ML evasion (model-extraction, adversarial examples) — Phase 4+; fraud-graph
poisoning — Phase 5; OIDC SSO federation attack surface — **implemented and tested in Phase 6
against a real fake-but-spec-compliant IdP (ADR-0008), but not yet validated against a live
vendor IdP**; SAML federation and MFA remain fully deferred (ADR-0008 §"What is explicitly NOT
done"); regional failover/disaster-recovery threats and multi-region deployment — **evaluated
at a design level only in Phase 8 (ADR-0010), not built or tested** (this project has never
run as more than one process against more than one Postgres instance); graceful-shutdown
drain on SIGTERM — found missing while load-testing Phase 8, not yet fixed (ADR-0010);
formal penetration test, real TLS termination infrastructure, a managed secrets manager,
container image scanning, and a full DAST scanner run — all Phase 9, all still
design-only/not implemented (ADR-0011); this sandbox has no cloud infrastructure to
demonstrate them against.
