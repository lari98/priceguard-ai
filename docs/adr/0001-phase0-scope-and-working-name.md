# ADR 0001: Phase 0 Gate — Scope Discipline and Working Name

## Context
The master project brief for PriceGuard AI specifies an extremely large, 56-section, 10+-phase enterprise platform (multi-signal risk engine, ML pipeline, fraud graph, 7+ SDKs, full GDPR compliance suite, enterprise dashboard). The brief itself mandates a phased build, starting with Phase 0 (Discovery) before any implementation, and explicitly forbids placeholder architecture, fake unimplemented functionality, and skipping phases.

## Decision
1. Phase 0 is treated as a hard gate: no code, schema, or infrastructure is created until the Phase 0 discovery document is produced and reviewed.
2. "PriceGuard AI" is retained as the working/internal name only. No trademark, domain, or naming-conflict clearance has been performed. A formal naming-clearance task is deferred to Phase 10 (Commercial Launch) per the brief's own instruction, and is tracked as open item R-1 in the Phase 0 document.
3. The MVP (Phase 2) will deliberately implement a narrow, real slice of functionality (tenant mgmt, ingestion API, basic country-mismatch rule engine, explainable score, minimal dashboard, audit log, human-review/appeal path) rather than a thin, partially-fake shell across all 56 brief sections at once.
4. Human-review and appeal tooling is pulled forward into the MVP definition (rather than left to Phase 6 "Enterprise Compliance") because of the Art. 22 exposure identified in the Phase 0 discovery document — any tenant enabling automated enforcement beyond "warning" needs this from day one.

## Alternatives considered
- **Build broad-but-shallow across all 56 sections simultaneously.** Rejected: violates the brief's own engineering-quality rules (§50, no placeholder architecture) and produces a demo that looks complete but is not trustworthy for an enterprise/compliance-sensitive product.
- **Defer appeal/human-review to Phase 6 as originally bucketed.** Rejected: creates a period where automated enforcement could plausibly exist without an Art. 22 safeguard, which is both a legal and reputational risk disproportionate to the schedule savings.
- **Pick a final commercial name now.** Rejected: no legal/trademark research has been done yet; naming under time pressure risks later costly rebranding.

## Advantages
Keeps the project defensible at every checkpoint; avoids legal exposure from shipping enforcement without safeguards; matches the brief's explicit phasing intent.

## Disadvantages
Slower initial visible progress across the full 56-section scope; some "enterprise" features (SSO, DSAR tooling) will look incomplete for longer than a naive reading of the brief's phase bucketing would suggest.

## Security implications
None directly; this ADR is scope/process only.

## Privacy implications
Pulling human-review/appeal into the MVP is a direct, positive privacy/compliance implication — it reduces the risk window during which automated decisions could operate without an Article 22-aligned safeguard.
