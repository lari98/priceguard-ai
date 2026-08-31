---
title: "Abuse Scenario Catalogue"
space: "PriceGuard AI Engineering"
parent: "Machine Learning"
labels: ["ml", "phase-3", "phase-4"]
source: "docs/ml/ABUSE_SCENARIO_CATALOGUE.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Abuse Scenario Catalogue (Phase 3 → feeds Phase 4 ML)

This is the "full catalogue" referenced by `docs/PHASE_0_DISCOVERY.md` §E, which deferred
it to Phase 3. It extends the eight scenarios adopted verbatim as the Phase 2 MVP's
acceptance-test suite (`apps/api/src/risk/scoring.service.spec.ts`) with labelled synthetic
examples suitable for supervised feature engineering in Phase 4.

**Status of each scenario against the current codebase:**

| # | Scenario | Label | MVP (rule engine) | Phase 4 (ML) | Phase 5 (fraud graph) |
|---|----------|-------|--------------------|---------------|------------------------|
| 1 | Single-country normal use | Legitimate | Handled (no alert) | Baseline training example | — |
| 2 | Short foreign travel (2 weeks) | Legitimate | Handled (travel-adjusted) | Baseline training example | — |
| 3 | Sustained cross-border mismatch (~6 months) | Suspicious | Handled (REQUEST_VERIFICATION) | Positive training example | — |
| 4 | Single-session VPN, otherwise normal | Ambiguous (insufficient alone) | Handled (signal recorded, no action) | Feature only, not a standalone label | — |
| 5 | Legitimate cross-border resident visiting "home" pricing country | Legitimate | Handled (travel considered) | Baseline training example | — |
| 6 | Gradual relocation (weeks-long transition) | Ambiguous, lower confidence than #3 | Handled (elevated, distinguishable) | Positive example, soft label | — |
| 7 | Rotating residential proxies, stable device | Suspicious | Handled (behavioural/device signal) | Positive training example | — |
| 8 | Shared-device/payment account-farm cluster | Suspicious (network-level) | **Not implemented** (`it.todo` in MVP) | Needs graph features | **Implemented in Phase 5** — see `fraud-graph` module |
| 9 | New account, immediate high-value transaction, no history | Suspicious | Not yet a rule | Positive example (cold-start pattern) | — |
| 10 | Long-tenured account, sudden device *and* country change same session | Suspicious | Not yet a rule | Positive example (account-takeover pattern) | Possible cluster link if credentials reused elsewhere |
| 11 | Frequent business traveler, 8+ countries/year, consistent device | Legitimate | Not yet a rule (would currently over-flag) | Negative example — teaches the model travel frequency alone isn't a signal | — |
| 12 | Data-center ASN + emulator-suspected device + brand-new account | Suspicious | Partially handled (VPN/emulator signals exist) | Positive example (bot/farm pattern) | Possible cluster link if device hash reused |
| 13 | Family/household sharing one account across two countries, low frequency | Legitimate (policy-dependent) | Not yet a rule | Negative example — cautionary: tenants may legitimately choose to flag this per their ToS, so it's labelled "legitimate" only for the *fraud* model, not a blanket policy recommendation | — |
| 14 | Reseller/account-farm: same payment method across 50+ accounts, no device overlap | Suspicious (network-level) | Not implemented | Needs graph features | **Implemented in Phase 5** — payment-method clustering |

Scenarios 9–14 are new in Phase 3 and are encoded as synthetic labelled feature vectors in
`apps/api/src/risk/fixtures/abuse-scenarios.json` (schema documented in that file's header),
consumed by Phase 4's `apps/api/src/ml/training/` pipeline. As with the original eight, these
are **synthetic, not real personal data or real customer traffic** — this catalogue does not
and must not become a channel for real tenant data to leave a tenant's own systems.

## Known limitation carried forward

This catalogue is authored by inference from the engineering patterns already implemented
and the gaps already flagged in Phase 0/1/2 docs (rule engine, IP intelligence, device
signals) — it has not been reviewed by a fraud/trust-and-safety domain expert or validated
against real abuse data, because neither is available in this environment. Before this
catalogue is used to justify any real enforcement decision (rather than as ML training
scaffolding), a domain expert review and a real (or realistic, consented) labelled dataset
are required. This is the same class of gap flagged for the legal/GDPR items in Phase 0 §I —
stated here rather than silently assumed away.
