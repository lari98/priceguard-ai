---
title: "Pricing Model"
space: "PriceGuard AI Engineering"
parent: "PriceGuard AI Engineering"
labels: ["business", "commercial"]
source: "docs/business/PRICING_MODEL.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Pricing Model (Phase 10 — working model, not validated against real customers)

This elaborates the preliminary candidates flagged in `docs/PHASE_0_DISCOVERY.md` §Q
("Pricing model candidates to model unit economics against in Phase 10 — not committed
yet") into a concrete structure, informed by researched 2026 pricing from comparable
fraud/risk-API vendors (sources at the bottom). **This is a proposed model to negotiate
real pilot customers against, not a finalized price list** — the master brief itself defers
final pricing to real usage data, and none exists yet (this platform has never served
production traffic).

## What the competitive landscape actually looks like

Researched public pricing clusters into two archetypes:

- **Self-serve, usage-metered** (MaxMind minFraud: $0.005–$0.020/query, no minimum;
  IPQualityScore: tiered monthly credit buckets from $99/mo) — targets developers/SMBs who
  self-provision with an API key and a credit card.
- **Enterprise quote-based** (Sift, Kount, Forter: no public price, sold via annual
  contract; Sift's median reported deal size is roughly $150K/year per third-party
  aggregator data) — volume- and module-gated, sales-led.

The near-universal pattern: a per-unit price that drops at higher volume tiers, with
feature-gating (a bare score vs. enriched signal/explanation data) as the main price lever,
converging to negotiated enterprise contracts at scale regardless of whether a public list
price exists.

## Proposed structure: hybrid platform fee + usage, enterprise tier above it

This matches the Phase 0 "hybrid of the first two" working assumption and this platform's
actual cost/value shape (see "Why this shape" below).

### Tier 1 — Starter (self-serve, PLG on-ramp)

- **$0/month**, up to 1,000 risk evaluations/month, rule-engine scoring only (no ML shadow
  model, no fraud-graph clustering), single API key, community/email support.
- Purpose: let a prospective tenant integrate and validate the product against real traffic
  before any commercial conversation — matches the industry's near-universal free-tier
  on-ramp (MaxMind, IPQualityScore).

### Tier 2 — Growth (usage-based platform fee)

- **$299/month base fee**, includes 25,000 risk evaluations/month.
- **$0.008 per additional evaluation** beyond the included volume (positioned between
  MaxMind's bare-score $0.005 and enriched-data $0.015–$0.020 rates, reflecting that this
  platform's per-evaluation cost includes an explainable 0–100 score plus evidence, not
  just a raw classification).
- Includes: full rule engine, the Phase 3 analytics dashboard, the Phase 4 shadow-ML
  pipeline (score comparison only — approval/rollout stays platform-default), the appeals
  workflow.
- Does not include: SSO/SAML, fine-grained RBAC overrides, DSAR export automation, or a
  dedicated SLA — gated to Enterprise, consistent with those being real, substantial Phase
  6 engineering investments this pricing needs to recover.

### Tier 3 — Enterprise (annual contract, quote-based)

- Custom, quote-based — matches the universal industry pattern that large accounts get
  negotiated contracts regardless of a published list price.
- Adds: OIDC SSO (ADR-0008), fine-grained RBAC with per-tenant permission overrides, DSAR
  self-service export automation, a named SLA (uptime + support response time — neither
  exists yet; see `docs/GA_LAUNCH_CHECKLIST.md`), data-residency commitments beyond the
  single-EU-region default (`docs/architecture/SECURITY_ARCHITECTURE.md`), and volume
  pricing typically below the Growth tier's per-unit rate at meaningful scale.
- Fraud-graph clustering (Phase 5) and staged ML rollout approval (Phase 4) are Enterprise
  features in this model, since they're the highest-engineering-investment capabilities and
  the ones most likely to matter to a large tenant's own T&S/fraud team rather than a
  small integrator.

## Why this shape (grounded in this platform's actual architecture, not guesswork)

- **A usage-based core matches the real cost driver.** Per `docs/performance/PHASE_8_LOAD_TEST.md`,
  each risk evaluation costs several sequential Postgres round-trips — cost scales with
  evaluation volume, not seats, so usage-based pricing (like the entire competitive set)
  tracks actual infrastructure cost more honestly than a flat per-seat SaaS price would.
- **A platform base fee, not pure pay-per-query, reflects the dashboard's value
  independent of API volume.** A tenant's Trust & Safety analysts use the Overview,
  Analytics, Investigations, Appeals, and Audit Log pages regardless of how many API calls
  their engineering team makes that month — MaxMind's pure per-query model works for a
  narrow IP-reputation lookup; it undervalues a platform with a full human-review/appeal
  workflow attached.
- **Enterprise features are gated to the Enterprise tier because they were real,
  substantial phases of engineering work** (Phase 6's SSO/RBAC/DSAR, ADR-0008; Phase 5's
  fraud-graph clustering, ADR-0007) — pricing them into the Growth tier would recover none
  of that investment from the customers least likely to need it.

## What this model does NOT account for (explicit gaps)

1. **No real customer has paid for this yet.** Every number above is a starting hypothesis
   to pressure-test against real pilot conversations, not a validated price point.
2. **No cost-of-goods-sold model exists.** The load test in
   `docs/performance/PHASE_8_LOAD_TEST.md` gives real latency/throughput numbers for this
   sandbox's 2-vCPU environment, but there is no real cloud hosting bill, IP-intelligence
   vendor cost (Module A/B remains unconfigured per ADR-0002), or support-staffing cost
   modeled against these price points yet — margin at each tier is unverified.
3. **No named SLA exists to sell against the Enterprise tier's implied uptime/support
   commitment.** See `docs/GA_LAUNCH_CHECKLIST.md`.
4. **Final commercial naming is unresolved** ("PriceGuard" trademark clearance — flagged as
   a Phase 10 blocker in `docs/PHASE_0_DISCOVERY.md` §R and never performed; see the launch
   checklist) — pricing collateral referencing the working name should be treated as
   provisional.
5. **No currency/region-specific pricing.** Given this platform's own subject matter
   (regional price discrimination), publishing a single USD price list without a stated
   regional-pricing policy is worth resolving deliberately, not by omission, before any
   real go-to-market motion.

## Sources consulted

- [MaxMind minFraud Plans & Pricing](https://www.maxmind.com/en/solutions/fraud-prevention/plans-pricing)
- [IPQualityScore Plans & Pricing](https://www.ipqualityscore.com/plans)
- [SEON Pricing](https://seon.io/pricing/)
- [Sift Pricing — Vendr](https://www.vendr.com/marketplace/sift-science)
- [Kount Pricing — G2](https://www.g2.com/products/kount/pricing)
