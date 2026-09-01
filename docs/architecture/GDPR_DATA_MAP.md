# GDPR Data Map — Phase 2 MVP Schema

Every personal-data-bearing field in the MVP Drizzle schema (`apps/api/src/db/schema.ts`),
its purpose, lawful-basis category (as processor, informing the tenant-controller's own
Art. 6 analysis — see `PRIVACY.md`), and retention tier. This table must be updated in the
same PR as any schema change that adds/removes a personal-data field (`CONTRIBUTING.md`).

| Field / Model | Data | Purpose | Personal data? | Retention tier (see `RetentionPolicy`) |
|---|---|---|---|---|
| `EndAccount.externalId` | Tenant's own opaque account identifier | Correlate events to one customer account without PriceGuard needing the tenant's full user profile | Pseudonymous identifier | Account lifetime + tenant retention window |
| `Session.ipAddress` | IP address (stored, not just derived fields) | Needed transiently for geolocation/ASN/VPN-likelihood derivation and impossible-travel detection | Personal data (Art. 4(1)) | **Short** (raw IP tier — default 7 days, tenant-configurable down, not up, past the platform floor) |
| `Session.derivedCountry`, `Session.asn`, `Session.vpnLikelihood` | Derived network signals | Long-run behavioural features (country entropy, primary-country estimate) | Derived, lower sensitivity than raw IP, but still profiling-relevant | **Medium** (derived-feature tier — default 90 days) |
| `Device.deviceHash` | SDK-generated device identifier (hashed, not a hardware serial) | Device-account/device-country consistency signal | Pseudonymous identifier | **Medium** |
| `Device.timezone`, `Device.locale`, `Device.osName` | Coarse device attributes | Behavioural consistency signal | Personal data (device-linkable) but coarse/low-sensitivity | **Medium** |
| `PaymentSignal.providerToken` | Tokenized payment reference from tenant's PSP | Payment-country/currency consistency signal, without ever handling PAN | Pseudonymous token, not card data | **Medium**; raw card data is never received, so no "short" tier applies here |
| `PaymentSignal.issuingCountry`, `.currency` | Derived payment attributes | Same as above | Personal data (linkable) | **Medium** |
| `RiskEvent` (full record) | Snapshot of the above at evaluation time | Evidentiary basis for a `RiskScore` | Personal data | **Medium**, default 180 days (matches brief's illustrative example) |
| `RiskScore.evidence` (JSON) | Feature contributions/explanation | Explainability requirement (brief §12/§18) | Personal data (derived) | Tied to parent `RiskEvent` retention |
| `RiskScore.facts` (JSON, added Phase 4) | Raw rule-engine feature map (same signals as `evidence`, machine-readable) used to score both the production rule engine and the Phase 4 shadow ML model | Train/serve feature parity for shadow-model evaluation (ADR-0006) — avoids re-deriving an approximation from `evidence`'s human-readable text | Personal data (derived), same category as `evidence` | Tied to parent `RiskEvent`/`RiskScore` retention — no separate retention rule |
| `ml_shadow_evaluations` (Phase 4) | Production vs. shadow score comparison per evaluated `RiskScore` | Shadow-model evaluation (ADR-0006) | Derived/aggregate — no new personal data beyond the `RiskScore` it references | Tied to parent `RiskScore` retention (cascade delete) |
| `device_account_links` (Phase 5) | Which end accounts have used which device | Fraud-graph clustering (ADR-0007, Scenario 8) | Personal data (linkable) | Tied to parent `Device`/`EndAccount` retention (cascade delete) |
| `fraud_clusters` (Phase 5) | Sets of end-account ids flagged as sharing a device/payment method | Fraud-graph clustering (ADR-0007) | Personal data (linkable — account ids) | **Short**; recomputed/replaced on each detection run, not independently retained long-term |
| `sso_identities` (Phase 6) | Which dashboard user maps to which external OIDC subject | SSO login (ADR-0008) | Personal data (dashboard-staff, not end-customer) | Tied to parent `TenantUser` retention (cascade delete) |
| `sso_configs` (Phase 6) | Tenant's OIDC issuer/client credentials | SSO login (ADR-0008) | Not personal data — tenant-level integration config; the client secret is confidential but not personal data | Tied to parent `Tenant` retention |
| `revoked_tokens` (Phase 6) | Revoked JWT ids (jti) | Session revocation (ADR-0008) | Not personal data on its own (an opaque token id); linked to a `TenantUser` (dashboard staff) | Effectively short-lived — a row is only meaningful until the token would have expired anyway (not yet auto-purged, see ADR-0008) |
| `dsr:export` action / `RiskScore.facts`+`evidence` etc. returned via `GET /dsr/end-accounts/:id/export` (Phase 6) | The DSAR self-service export itself | Art. 15/20 access/portability (ADR-0008) | The export's *content* is exactly the personal data rows already listed above — this row documents the new *access path*, not new data | N/A — no new storage, a read-only aggregation of existing rows |
| `Investigation`, `Appeal` | Analyst notes, customer appeal text | Human-review/appeal workflow, Art. 22 safeguard | Personal data (may include free text) | **Long** — compliance-defined, tenant-configurable, default 2 years |
| `AuditLogEntry` | Actor, action, before/after state | Accountability (Art. 5(2)), dispute resolution | Personal data (actor identifiers) | **Compliance-defined**, not tenant-shortenable below a platform floor (see ADR-0004: pseudonymised on account erasure, never deleted) |
| `GPS/precise location` | — | — | **Not collected in the MVP schema at all** | N/A — see `PRIVACY.md` |
| Raw payment card number (PAN) | — | — | **Never received or stored** — out of PCI scope by design | N/A |

## International transfer note

The MVP's reference deployment target is a single EU region (see
`docs/architecture/SECURITY_ARCHITECTURE.md` "Data residency"). If a tenant's own
subprocessor (e.g., a non-EU IP-intelligence vendor) is used, that transfer is the
**tenant's** integration choice, not one made silently by this codebase — the IP-intelligence
provider is pluggable and unconfigured in the MVP (see ADR-0002 "deferred").
