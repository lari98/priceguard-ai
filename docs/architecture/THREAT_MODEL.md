# Threat Model (STRIDE) — Phase 2 MVP Scope

Elaborates Phase 0 §D for the concrete MVP components. Re-run this exercise (and extend
the table) at the start of every subsequent phase that adds a new container per ADR-0002/0003.

| # | Component | Threat (STRIDE) | Scenario | Mitigation (implemented / planned) |
|---|---|---|---|---|
| 1 | Ingestion API | Spoofing | Attacker forges a tenant's API key | API keys are bcrypt-hashed at rest, transmitted only over TLS, rotatable via dashboard; key prefix + secret split so a leaked log line doesn't expose the full key (implemented: `ApiKeyGuard`) |
| 2 | Ingestion API | Tampering | Malicious/compromised SDK sends fabricated device/session telemetry to manipulate its own risk score | MVP mitigation is limited (documented gap): server-side plausibility checks (e.g., timestamp skew bounds, event-type enum validation) are implemented; full anti-tampering (attestation, signed SDK telemetry) is a Phase 4/Adversarial-Resilience item (brief §32), not solved in MVP — flagged, not silently assumed solved |
| 3 | Multi-tenant data store | Information Disclosure | A query bug returns Tenant B's risk events to a Tenant A analyst | Every Drizzle query in service code is required to filter by the authenticated `tenantId` — enforced by convention plus review, not a generic repository base class (see the rationale for that trade-off in ADR-0003 and the comment in `apps/api/src/db/db.module.ts`); a dedicated integration test (`apps/api/test/tenant-isolation.e2e-spec.ts`) asserts cross-tenant reads return 404/empty, not another tenant's data |
| 4 | Admin dashboard auth | Spoofing / Elevation of Privilege | Stolen JWT reused after a role downgrade | Short JWT expiry (`JWT_EXPIRES_IN`, default 8h) + role re-checked server-side on every request (not cached in the token beyond session lifetime); full session revocation list is a Phase 6 (SSO/enterprise) hardening item |
| 5 | Rule/Policy engine | Tampering | A tenant admin (or a compromised dashboard session) writes a policy that auto-suspends every account | `requiresHumanReview` cannot be set to `false` for any action in `{REQUEST_VERIFICATION, RESTRICT, MANUAL_REVIEW, SUSPEND, TERMINATE}` — enforced server-side in `PolicyEngineService.validateRuleInput` (throws on violation), called from `PolicyService.createPolicy` before any rule is persisted, not just a UI-level checkbox |
| 6 | Audit log | Repudiation | An analyst denies having approved an enforcement action | Every `AuditLogEntry` records `actorId`, `actorType`, `tenantId`, `action`, `beforeState`/`afterState` snapshot, and `createdAt`; the table is insert-only at the application layer (no `UPDATE`/`DELETE` service method exists for it) |
| 7 | Ingestion API | Denial of Service | Flood of fake risk events exhausts DB/compute | `@nestjs/throttler` per-API-key rate limits on `/v1/risk/events`; documented as a starting point, not a substitute for edge/CDN-level DDoS protection (Phase 8/9 item) |
| 8 | Any future outbound enrichment call | SSRF | A malicious or malformed URL/host causes the server to make requests to internal infrastructure | No outbound enrichment exists in the MVP (see ADR-0002 — IP-intelligence integration is a documented Phase 2/3 follow-up, not built yet); this row exists so the control (egress allowlist) is designed in before that code is written, not after |
| 9 | Dependency supply chain | Tampering | A compromised npm dependency introduces malicious code | `npm audit` runs in CI; Dependabot opens weekly update PRs; full SBOM generation and SAST/DAST are Phase 9 items (not yet implemented — see `SECURITY.md` "Known gaps") |
| 10 | Appeals workflow | Elevation of Privilege | An end-customer's appeal submission is used as an injection vector into analyst tooling (e.g., stored XSS in the dashboard) | Appeal free-text fields are stored as-is but rendered in the Next.js dashboard through React's default escaping (no `dangerouslySetInnerHTML` used anywhere in `apps/web`); the submission path itself is covered by `apps/api/test/appeals.e2e-spec.ts` |

## Explicitly deferred to later phases (not solved by this document or the MVP code)

Adversarial ML evasion (model-extraction, adversarial examples) — Phase 4+; fraud-graph
poisoning — Phase 5; SSO/SAML federation attack surface — Phase 6; regional
failover/disaster-recovery threats — Phase 8; formal penetration test — Phase 9.
