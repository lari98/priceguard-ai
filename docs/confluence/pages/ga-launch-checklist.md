---
title: "GA Launch Checklist"
space: "PriceGuard AI Engineering"
parent: "PriceGuard AI Engineering"
labels: ["business", "commercial"]
source: "docs/GA_LAUNCH_CHECKLIST.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# GA Launch Checklist (Phase 10)

A single, honest consolidation of every gap flagged across this project's ADRs,
`SECURITY.md`, and `docs/architecture/THREAT_MODEL.md`. This checklist exists so a launch
decision is made against one accurate list, not by re-deriving it from memory across eleven
ADRs. **As of this writing, this platform is NOT ready for GA** — the "Blocking" section
below is non-empty, and no version has shipped (`CHANGELOG.md` `[Unreleased]` has never been
cut to a tagged release).

## How to read this document

- **Done** — genuinely implemented and tested against real infrastructure, per this
  project's engineering discipline (see `CONTRIBUTING.md`).
- **Blocking for GA** — a real customer could be harmed (financially, legally, or through a
  security incident) if this platform launched without it. Must close before v1.0.0.
- **Not blocking, but should close soon after GA** — genuine gaps, lower immediate risk;
  reasonable to ship v1.0.0 with these open and a committed timeline to close them.

## Blocking for GA

| Item | Why it blocks | Source |
|---|---|---|
| Real TLS termination | `SECURITY.md` already asserts "TLS required for all external traffic" as a requirement with no infrastructure to back it — shipping without it would make that a false claim, not an aspiration. | ADR-0011 |
| A managed secrets manager | Production secrets (JWT signing key, DB credentials, SSO client secrets) living only in plain environment variables is a real, common breach vector at real operational scale. | ADR-0011, `SECURITY.md` |
| Trademark/naming clearance | "PriceGuard" and close variants are common in this exact product category (`docs/PHASE_0_DISCOVERY.md` §R) — launching commercially under an uncleared name risks a rebrand under legal pressure post-launch, which is far more disruptive than resolving it first. | `docs/PHASE_0_DISCOVERY.md` §R |
| A real, live-IdP-tested SSO integration | The only SSO testing done (ADR-0008) is against a self-authored fake OIDC provider — real vendor IdPs (Okta, Azure AD, Auth0) have integration-breaking quirks a fake provider cannot surface. Any Enterprise-tier deal depending on SSO needs this validated against that customer's actual IdP before go-live, not after. | ADR-0008 |
| A named, honest SLA | The pricing model's Enterprise tier (`docs/business/PRICING_MODEL.md`) implies an SLA commitment; none is defined. Selling an implied SLA with nothing behind it is a contract-risk, not just a documentation gap. | `docs/business/PRICING_MODEL.md` |
| Formal legal/privacy counsel review | `PRIVACY.md`/`docs/architecture/GDPR_DATA_MAP.md` are engineering-authored good-faith compliance documentation, explicitly not a substitute for the tenant's own Art. 6 analysis or this platform's own counsel sign-off before any GDPR-compliance claim is made externally. | `PRIVACY.md`, `docs/PHASE_0_DISCOVERY.md` §R |

## Not blocking, but should close soon after GA

| Item | Current state | Source |
|---|---|---|
| Container image scanning | Not implemented — SBOM covers the npm dependency tree, not OS image layers. | ADR-0011 |
| A full DAST scanner run (OWASP ZAP/Burp) | Only a small, targeted 11-case smoke test exists (`security-smoke.e2e-spec.ts`), not a scanner's broad crawl-and-attack coverage. | ADR-0011 |
| Formal third-party penetration test | Never performed. | `docs/architecture/THREAT_MODEL.md`, ADR-0011 |
| Multi-region deployment | Evaluated at a design level only (ADR-0010) — this platform has never run as more than one process against more than one Postgres instance. | ADR-0010 |
| Graceful-shutdown drain on SIGTERM | Found missing while load-testing (Phase 8); an in-flight request during a deploy can be cut off mid-write. | ADR-0010 |
| Cluster-wide / per-tenant rate limiting | Currently per-replica and tracked by source IP, not cluster-wide or per-API-key — documented, real gap for a horizontally-scaled or multi-tenant-behind-shared-NAT deployment. | ADR-0010 |
| SAML and MFA | Only OIDC SSO is implemented; SAML remains common in older enterprise environments; local-password users have no MFA option. | ADR-0008 |
| Password-reset-forcing endpoint | Session revocation (Phase 6) doesn't stop a new login with a still-valid, compromised password. | `docs/security/INCIDENT_RESPONSE.md` |
| Revoked-token/login-attempt row purging | `revoked_tokens` and `sso_login_attempts` grow forever — low risk at real scale, but no cleanup job exists. | ADR-0008 |
| SDK: OpenAPI-generated types, npm/PyPI publishing, retry/batching | Both SDKs (Node, Python) are hand-written and unpublished; a schema drift is only caught by their e2e tests, not a build-time contract check. | ADR-0009 |
| Dedicated scoring service extraction | Evaluated and deferred — Phase 8's load test showed DB round-trips, not in-process scoring, are the actual bottleneck; re-evaluate if that changes. | ADR-0006, ADR-0010 |
| Read replica / connection pooler (PgBouncer) | Pool size is now tunable (`DB_POOL_MAX`) but no read/write splitting or pooling middleware exists. | ADR-0010 |
| A staffed security inbox and SLA | `security@[project-domain-tbd]` is a placeholder pending a registered domain. | `SECURITY.md` |
| SIEM/alerting/on-call/paging integration | Nothing in this platform proactively pages anyone; every incident-response runbook assumes a human already knows to act. | `docs/security/INCIDENT_RESPONSE.md` |
| Real IP-intelligence and identity/KYC vendor integration | Both remain pluggable-but-unconfigured (ADR-0002) — the MVP ships with a deterministic test provider, not a live third-party lookup. | ADR-0002 |
| Streaming feature store / event stream (Kafka-compatible) | The batch feature store (Phase 3) reads from nightly/on-demand snapshots, not a real-time stream — deferred until real ingestion volume justifies the operational cost. | ADR-0002, `docs/architecture/C4_DIAGRAMS.md` |
| GDPR/AI-Act regulatory re-verification | Built against a snapshot of guidance as of this project's start; the EU's Digital Omnibus and related ADM guidance were actively moving as of `docs/PHASE_0_DISCOVERY.md` — re-verify before any external compliance claim. | `docs/PHASE_0_DISCOVERY.md` §R |

## What IS genuinely done (the actual GA-relevant foundation)

Rules-based risk scoring with an explainable 0–100 score and evidence (Phase 2); a human-
review/appeal path shipped as MVP-critical, not deferred (Phase 2); batch analytics
(Phase 3); a shadow-ML pipeline with staged rollout approval (Phase 4); real fraud-graph
clustering that found and fixed a genuine schema bug (Phase 5); OIDC SSO against a
protocol-correct fake IdP, fine-grained RBAC, DSAR export, and session revocation (Phase 6);
two real, tested client SDKs (Phase 7); a real load test that found and fixed a genuine
concurrency bug (Phase 8); real SBOM/SAST in CI and a DAST-style smoke test that found and
fixed a genuine 413-vs-500 bug, plus incident-response runbooks and API-key revocation
(Phase 9). Every one of these has passing tests against real Postgres, not mocks — see each
phase's `CHANGELOG.md` entry for exact test counts at the time.

## Recommendation

Do not tag v1.0.0 until the "Blocking for GA" table above is empty. The "not blocking"
table is a legitimate, disclosed post-GA roadmap, not a launch condition — but it should
ship as a public roadmap alongside GA, not be silently discovered by the first real
customer.
