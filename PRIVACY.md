# Privacy Policy (Engineering Reference)

This document describes how the **GeoGuard AI codebase** is designed to handle personal
data. It is an engineering reference, not a substitute for a tenant's own privacy notice,
DPIA, or legal advice. See `docs/PHASE_0_DISCOVERY.md` §I–J for the full analysis and the
list of open questions that require qualified EU/German legal review.

## Roles

GeoGuard AI is designed to act as a **data processor** on behalf of each tenant (the
**data controller** for their own end users). Tenant configuration, a Data Processing
Agreement, and a subprocessor register are expected artifacts of Phase 6 — this codebase
enforces the *technical* side of that split (tenant data isolation, retention, deletion),
not the contractual side.

## Data minimisation, as implemented

- Raw payment card data is **never** received or stored by this codebase — the `PaymentSignal`
  model only stores a `providerToken` reference and low-cardinality derived fields
  (issuing country, currency) that a tenant's own PCI-DSS-scoped processor is contractually
  able to share.
- Precise GPS is **not** a collected field in the MVP schema at all — only coarse,
  IP/network-derived geolocation. If a future tenant use case justifies precise location,
  it must be added as an explicit, separately-consented, retention-limited field, not
  folded into existing device telemetry.
- Device telemetry is limited to the fields listed in `docs/architecture/GDPR_DATA_MAP.md`;
  fields are added to the schema only with a documented purpose in that data map (this is
  a process rule for contributors, enforced in code review — see `CONTRIBUTING.md`).

## Retention, as implemented

Every tenant has a `RetentionPolicy` record (see Prisma schema) governing how long raw
session/IP observations, derived risk features, risk events, and audit logs are kept.
A scheduled deletion job (`apps/api/src/retention/retention.service.ts`) enforces these
windows. Defaults are conservative (see the schema's `@default` values); tenants can
tighten, but not loosen, them below the platform-wide floor set in code.

## Automated decision-making safeguard

No enforcement action beyond `WARN` can be marked `autoApproved` in this codebase without
an explicit `requiresHumanReview: true` policy flag being satisfiable — see
`apps/api/src/policy/policy.service.ts` and the Appeals module. This is the technical
implementation of the Article 22 safeguard analysis in `docs/PHASE_0_DISCOVERY.md` §I;
whether a specific tenant's configured workflow is legally sufficient in their jurisdiction
remains a legal determination outside this codebase's authority.

## Data subject rights scaffolding

`apps/api/src/dsr/` (Data Subject Request) provides tenant-scoped export and erasure
endpoints for an `EndAccount` and its associated events/devices/sessions, subject to the
audit-log immutability requirement (audit entries referencing a deleted account are
pseudonymised, not deleted, to preserve audit integrity — see ADR-0004).
