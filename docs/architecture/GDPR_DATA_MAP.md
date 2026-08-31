# GDPR Data Map — Phase 2 MVP Schema

Every personal-data-bearing field in the MVP Drizzle schema (`apps/api/src/db/schema.ts`),
its purpose, lawful-basis category (as processor, informing the tenant-controller's own
Art. 6 analysis — see `PRIVACY.md`), and retention tier. This table must be updated in the
same PR as any schema change that adds/removes a personal-data field (`CONTRIBUTING.md`).

| Field / Model | Data | Purpose | Personal data? | Retention tier (see `RetentionPolicy`) |
|---|---|---|---|---|
| `EndAccount.externalId` | Tenant's own opaque account identifier | Correlate events to one customer account without GeoGuard needing the tenant's full user profile | Pseudonymous identifier | Account lifetime + tenant retention window |
| `Session.ipAddress` | IP address (stored, not just derived fields) | Needed transiently for geolocation/ASN/VPN-likelihood derivation and impossible-travel detection | Personal data (Art. 4(1)) | **Short** (raw IP tier — default 7 days, tenant-configurable down, not up, past the platform floor) |
| `Session.derivedCountry`, `Session.asn`, `Session.vpnLikelihood` | Derived network signals | Long-run behavioural features (country entropy, primary-country estimate) | Derived, lower sensitivity than raw IP, but still profiling-relevant | **Medium** (derived-feature tier — default 90 days) |
| `Device.deviceHash` | SDK-generated device identifier (hashed, not a hardware serial) | Device-account/device-country consistency signal | Pseudonymous identifier | **Medium** |
| `Device.timezone`, `Device.locale`, `Device.osName` | Coarse device attributes | Behavioural consistency signal | Personal data (device-linkable) but coarse/low-sensitivity | **Medium** |
| `PaymentSignal.providerToken` | Tokenized payment reference from tenant's PSP | Payment-country/currency consistency signal, without ever handling PAN | Pseudonymous token, not card data | **Medium**; raw card data is never received, so no "short" tier applies here |
| `PaymentSignal.issuingCountry`, `.currency` | Derived payment attributes | Same as above | Personal data (linkable) | **Medium** |
| `RiskEvent` (full record) | Snapshot of the above at evaluation time | Evidentiary basis for a `RiskScore` | Personal data | **Medium**, default 180 days (matches brief's illustrative example) |
| `RiskScore.evidence` (JSON) | Feature contributions/explanation | Explainability requirement (brief §12/§18) | Personal data (derived) | Tied to parent `RiskEvent` retention |
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
