# PriceGuard AI — Phase 0: Product, Legal, Privacy & Technical Discovery

**Status:** Draft for review — working name "PriceGuard AI" is a placeholder pending trademark/naming clearance (tracked as a Phase 1 task, see §Q and open item R-1).
**Date:** 2026-08-18
**Document owner:** Founder (Muhammad Umer), drafted with Claude acting as CTO/architect advisor.
**Scope of this document:** Discovery and requirements only. No implementation has begun. This document is the gate the master project brief requires before Phase 1 (Architecture) starts.

---

## A. Refined Product Definition

PriceGuard AI is a **global regional-pricing integrity and subscription-abuse detection platform**, delivered as multi-tenant B2B SaaS with API/SDK integration. It is not built for any single vertical, region, or country pair. Any company that (a) charges different prices for the same digital product in different countries or regions, and (b) wants to protect that pricing model without falsely accusing legitimate travellers, expatriates, or relocating customers, is a potential customer — streaming and media, gaming, SaaS, telecom/eSIM, digital marketplaces, edtech, and membership products.

The product's job is narrow and explicit: **ingest behavioural, network, device and payment signals; produce an explainable, confidence-scored estimate of a customer's likely primary usage country versus their billed pricing country; and hand that estimate to a policy engine the customer company configures and controls.** PriceGuard AI never issues fines, never auto-terminates accounts by default, and never treats a single signal (e.g., one VPN-flagged session) as proof of abuse. It is a decision-support and policy-automation layer, not a judge, jury, or collections agency.

Two outputs are always kept separate and never merged into one "guilty/not guilty" flag:

1. **Likely Primary Usage Country** — a probability distribution over countries, based on long-run behavioural evidence.
2. **Geo-Pricing Abuse Risk Score** — a 0–100 score reflecting how inconsistent the customer's *declared/billed pricing region* is with their *likely primary usage country*, adjusted for legitimate explanations (travel, relocation, shared plans, etc.).

This document underpins that design and should be read before any code is written.

---

## B. Problem Statement

Digital subscription businesses routinely price the same product differently across countries to reflect purchasing power parity, local competition, taxation, and licensing costs. Publicly documented examples confirm the scale of the price gap and the resulting arbitrage industry: Netflix's US plans run roughly 5–6x its India pricing, and consumer guides devoted entirely to "get subscriptions cheaper via VPN" exist for Netflix, Spotify, and YouTube Premium. Google has begun **automatically cancelling YouTube Premium subscriptions when an account's usage location diverges from its signup country**, using a fairly blunt signal (Tom's Guide, 2026) — which is exactly the kind of unsophisticated, high-false-positive approach this platform is designed to improve on.

The business problem has two failure modes, and today's market mostly only solves one of them:

1. **Under-detection / revenue leakage:** naive geo-IP or billing-country checks are trivially defeated by consumer VPNs, residential proxies, virtual/prepaid cards, and account sharing. Point solutions like MaxMind minFraud, IPQualityScore, Spur, and proxycheck.io are excellent at *IP-level* VPN/proxy/datacenter classification, but none of them are built to reason about *sustained behavioural residency* over months, separate "primary country" from "abuse risk," or plug into a company's own contractual enforcement policy.
2. **Over-detection / false positives:** systems (like the blunt YouTube Premium approach) that key off one or two signals inevitably catch legitimate travellers, expatriates, students studying abroad, military and diplomatic personnel, digital nomads, and people mid-relocation. This generates support burden, churn, brand damage, and — in the EU — real legal exposure under GDPR Article 22 if the decision is fully automated and has a "similarly significant effect" on the person (e.g., account suspension).

PriceGuard AI's differentiated bet: **be the neutral, explainable, multi-signal risk layer that sits between "an IP looked wrong" and "we suspended someone's account,"** giving companies the evidence and policy tooling to make defensible, auditable, and jurisdiction-aware enforcement decisions themselves — never asserting legal authority the platform does not have.

---

## C. Customer Personas

**Persona 1 — Trust & Safety / Fraud Lead at a mid-size streaming or SaaS company ("Priya," Head of Trust & Safety).** Owns chargeback and abuse metrics, is measured on both fraud loss and customer complaint volume, and is wary of any vendor whose false-positive rate will generate support tickets and press ("company banned my account for traveling"). Wants dashboards, evidence, and a policy engine she controls — not a black box that auto-punishes.

**Persona 2 — Platform/Backend Engineering Lead ("Daniel," Staff Engineer).** Needs to integrate a risk signal into an existing subscription/auth flow without rewriting billing or entitlement systems. Cares about SDK quality, latency budget (must not slow down login/checkout), webhook reliability, sane API contracts, and sandbox/testing tooling.

**Persona 3 — Data Protection Officer / Legal Counsel ("Claudia," DPO at an EU-headquartered company).** Needs to justify the tool in a DPIA, confirm it does not perform prohibited automated decision-making without safeguards, wants data residency and retention controls, subprocessor transparency, and a documented lawful basis story before she will sign off on procurement.

**Persona 4 — Revenue/Finance stakeholder ("Marco," VP Revenue Ops or CFO-adjacent).** Cares about quantified revenue leakage from regional-pricing abuse and expects the dashboard to translate detections into a defensible dollar (or EUR) figure, without overclaiming precision.

**Persona 5 — End customer of PriceGuard's customer (indirect persona, "Aisha," a real subscriber).** Never interacts with PriceGuard directly, but is the person whose experience is at stake: an expat, student, dual-resident, or genuine abuser. Every design decision — appeals, human review, evidence thresholds — exists to protect Aisha #1 (legitimate) from being treated like Aisha #2 (abusive), even though PriceGuard's paying customer is the company, not Aisha.

---

## D. Threat Model

**Assets to protect:** company tenants' risk-scoring configuration and data; the integrity of the detection signals themselves (an attacker who learns exact thresholds can evade them); end-customer PII collected incidentally (IP, device identifiers, coarse location); the risk-scoring/ML pipeline; API keys and webhook secrets; audit/appeal records (must be tamper-evident).

**Primary adversaries:**
- **Individual regional-pricing arbitrageurs** — technically unsophisticated to moderately sophisticated consumers using commercial VPN apps, Smart DNS, or a friend's card. High volume, low individual sophistication.
- **Organized subscription-resale / account-farm operators** — sell access to "region-locked" cheap subscriptions at scale, using automation, device farms, residential-proxy networks, and shared/virtual payment tokens. Low volume of operators, high impact per operator, adversarial and adaptive.
- **Malicious insiders at customer companies** — could misuse PriceGuard evidence to justify pretextual account termination unrelated to actual pricing abuse (a policy/product-design risk, not just a security one).
- **External attackers targeting PriceGuard itself** — credential stuffing against the admin dashboard, API-key theft, SSRF/injection against the risk-ingestion API, attempts to poison the ML training set with fabricated telemetry, cross-tenant data leakage attempts.
- **Curious or hostile researchers/competitors** — probing the public API/SDKs to reverse-engineer detection thresholds (mitigated by never exposing full internal reasoning in customer-facing explanations, per master brief §18).

**Key threat scenarios to design against (STRIDE-style, elaborated in Phase 1):** spoofed/tampered SDK telemetry (fake device signals); replayed session data; cross-tenant data disclosure via a shared risk-events table; SSRF from the IP-intelligence enrichment step calling attacker-controlled URLs; privilege escalation in the RBAC model letting a Company A analyst see Company B's investigations; model-extraction / adversarial-example attacks against the ML risk scorer; webhook endpoint spoofing without signature verification; secrets left in SDK client bundles.

**Explicitly out of scope for PriceGuard's own defenses:** PriceGuard is not attempting to defeat state-level adversaries, is not a lawful-intercept or surveillance tool, and does not attempt device-level rooting/jailbreak forensics beyond what a privacy-conscious mobile SDK can observe.

---

## E. Abuse Scenarios (illustrative, not exhaustive — full catalogue is now in `docs/ml/ABUSE_SCENARIO_CATALOGUE.md`, built in Phase 3)

1. **Persistent regional mismatch:** Account registered and billed under Country A's lower price; 95%+ of sessions over a 6-month window originate from Country B; device timezone, locale, and network are consistently Country B; Country A is observed only at signup. High primary-country confidence for B, high abuse-risk score.
2. **VPN-only edge case:** A single session shows a VPN/datacenter IP from the discount country, but device timezone, language, historical session geography, and payment country are all consistent with the higher-priced country and no other suspicious session exists. Low standalone evidentiary weight — flagged for monitoring, not enforcement.
3. **Coordinated account farm:** Dozens of accounts share a small pool of devices and/or a small pool of payment tokens, register from the discount country, and are consumed almost entirely from a different country or countries — a graph-detectable cluster rather than a single-account behavioural anomaly.
4. **Rotating residential proxies:** An operator rotates IPs constantly to defeat IP-reputation lists, but device fingerprints, behavioural cadence, and payment-token reuse remain stable — the case for why device/behaviour signals must be first-class, not just IP signals.
5. **Gradual "fake relocation" story used defensively:** An account manufactures a plausible-looking but fabricated travel narrative (e.g., periodic short "trips" back to the billed country) purely to reset observation windows — the case for why travel-pattern authenticity (return behaviour, trip duration distribution, corroborating signals) must itself be modeled, not merely self-declared.
6. **Payment-instrument arbitrage:** Foreign-issued virtual/prepaid cards or repeated payment-method switching used to keep the billing profile aligned with the cheap region regardless of usage geography.

---

## F. Legitimate-Use Scenarios (false-positive-critical — treat as first-class requirements, not edge cases)

Genuine expatriates and immigrants (permanent or long-term relocation); students studying abroad on a home-country family plan; digital nomads and remote workers with no single fixed residence; military, diplomatic, and government personnel on deployment; cross-border commuters (e.g., living in one country, working daily in a neighboring one); tourists and short/medium-term travellers; people fleeing conflict or persecution (refugees), who may have unstable documentation and should not be penalized for it; dual residents genuinely splitting time between two countries; families legitimately sharing a plan permitted under the company's own terms; people mid-relocation whose "primary country" is genuinely, correctly transitioning over weeks or months.

The system must be able to represent **"we don't have enough evidence yet"** and **"this looks like legitimate transition, not abuse"** as first-class outcomes — not just points on a single risk dial. This is why Likely-Primary-Country confidence, Travel-Probability, and Abuse-Risk are kept as separate, independently reported numbers (see §K and the master brief's Country Residence Confidence Engine, item 9).

---

## G. Functional Requirements

**Ingestion & Integration:** accept risk-relevant events (session start, login, payment, subscription-region change) via REST/GraphQL API, server-to-server calls, and client SDKs across web, mobile, and backend languages; provide webhooks for asynchronous risk-decision delivery; provide a sandbox environment and test API keys so integration can be validated without touching production tenants.

**Signal collection & enrichment (Modules A–F of the master brief):** IP intelligence (geolocation, ASN, reputation, proxy/VPN/Tor/datacenter likelihood, impossible-travel detection); privacy-conscious device intelligence (OS, app version, timezone, locale, device-account/device-country consistency, emulator/automation likelihood); payment-country intelligence via tokenized, PCI-scope-avoiding integration with the customer's existing PSP (PriceGuard must never touch raw card data); long-run account-behaviour features (country entropy, session distribution, device distribution, sudden shifts); a travel-legitimacy model; a primary-country/abuse-risk dual-score engine; an account-relationship graph for farm/cluster detection.

**Decisioning:** produce a 0–100 explainable risk score with confidence, evidence, feature attributions, model version, and policy version on every evaluation; support configurable score bands per tenant (no hard-coded universal thresholds); support a no-code, nested-logic (AND/OR/NOT) policy/rule builder per tenant with country groups, allow/block lists, exceptions, and travel-duration allowances.

**Enforcement (customer-controlled, never PriceGuard-imposed):** expose a menu of enforcement actions a tenant can wire to its own policy — warn, request re-verification (country, payment, identity), temporarily restrict features, propose plan/region migration, escalate to manual investigation, suspend, or terminate — with every non-trivial action supporting a "require human review" toggle and a customer-facing appeal path.

**Verification:** support pluggable, data-minimizing verification methods (billing-address confirmation, payment-country confirmation, third-party KYC/IdV providers returning pass/fail rather than raw documents, phone verification, re-authentication) that a tenant can require at configurable risk thresholds.

**Explainability & audit:** every decision must produce both an internal analyst explanation (full evidence) and a distinct customer-facing explanation (evidence summarized without exposing exact detection thresholds/mechanisms); every decision, review, override, and appeal outcome must be immutably logged for audit.

**Multi-tenant administration:** tenant/org management, RBAC (and later ABAC), API-key issuance/rotation, webhook management, retention configuration, and the dashboards enumerated in master brief §19–20.

**Non-functional but functionally load-bearing:** appeals and human-review workflows are not optional add-ons — they are required for any tenant enabling automated enforcement above "warning" severity, both as a product requirement and (per §I/J below) very likely a legal one.

---

## H. Non-Functional Requirements

**Performance/latency:** a real-time risk decision path (cached/precomputed features, lightweight model or rules) must return within a budget compatible with login/checkout UX — target sub-200ms server-side p95 for the "fast path," with expensive graph/ML re-scoring happening asynchronously/near-real-time and feeding back into the next fast-path evaluation (see master brief §29–30). Exact SLOs to be finalized with real traffic data in Phase 1/8.

**Scalability:** must support tenants ranging from thousands to hundreds of millions of end-user accounts and high-throughput event ingestion (streaming architecture, not batch-only), with graceful multi-region deployment.

**Availability:** the risk-decision API is on a customer's critical auth/checkout path for tenants who choose synchronous integration, so it must degrade safely — a documented "fail open with monitoring" vs. "fail closed" policy per tenant is required; PriceGuard being down must never be capable of locking out a tenant's entire customer base by default.

**Multi-tenant isolation:** strict logical (and where required, physical/regional) data isolation between tenants; isolation must be verified by automated tests, not just code review (master brief §33–34).

**Security & privacy:** see §I. Encryption in transit and at rest, secrets management, RBAC/SSO/MFA, rate limiting, and the full OWASP-aligned control set in master brief §25 are non-functional requirements from day one, not later hardening.

**Maintainability/observability:** every model decision must carry a model version and policy version; OpenTelemetry-style tracing and metrics from Phase 1 onward; no "temporarily disabled test" debt tolerated per the master brief's engineering-quality rules (§50).

**Explainability as a non-functional constraint:** the system must be able to answer "why did this account get this score" for every decision it has ever made, for as long as retention policy keeps the underlying evidence — this shapes data-model and logging requirements, not just the ML layer.

---

## I. GDPR / Privacy Requirements

PriceGuard AI must be built **Privacy by Design and by Default** (GDPR Art. 25) from the first line of code, because it is squarely a profiling system under Art. 4(4) — it evaluates personal aspects (location/behaviour) to analyze or predict something about a person. Concretely, that means:

- **Lawful basis:** PriceGuard itself is typically a data **processor** acting on behalf of its tenant (the **controller**), which determines the lawful basis (usually legitimate interest or contract necessity) for its own end users. PriceGuard's contracts and documentation must make this controller/processor split explicit (Art. 28 processor obligations, a Data Processing Agreement template, and a subprocessor register — see master brief §48).
- **Purpose limitation & data minimisation (Art. 5):** collect only signals with a demonstrable link to the stated purpose (pricing-integrity risk assessment); no fingerprinting "because it's technically possible" (explicit master-brief instruction, §5); no raw payment-card data ever (PCI-DSS-scoped tokenization only); GPS precision should default to disabled/coarse unless a tenant has a specific, documented justification.
- **Storage limitation:** tenant-configurable, tiered retention (raw session/IP signals short-lived; derived risk features longer; audit/appeal records per compliance need) with automatic expiry — this is the literal design behind the "Privacy Control Center" the user specified, and should be treated as an MVP-adjacent feature, not a nice-to-have added later, given how central it is to the compliance story.
- **Accuracy & data-subject rights (Art. 15–21):** because a "primary country" inference can be wrong, the platform must support access, rectification, erasure/restriction, and objection workflows that a tenant (as controller) can execute, and that PriceGuard (as processor) must technically support, including cross-tenant-safe deletion.
- **Automated decision-making, Art. 22:** this is the single most important legal design constraint in the whole system. Article 22 restricts decisions "based solely on automated processing" that produce "legal or similarly significant effects" (account suspension/termination plausibly qualifies). The EDPB's guidance (originally Guidelines on ADM and profiling, WP251, still the reference framework; the EDPB's ADM/profiling work is active and the EDPB-EDPS issued a Joint Opinion on the "Digital Omnibus" proposal in February 2026 touching AI/ADM/profiling simplification — meaning **this area of law is currently in flux at the EU level and must be re-checked immediately before Phase 6 (Enterprise Compliance) implementation**, not assumed static from this document) generally requires: meaningful human involvement in decisions with significant effect, a right to contest and obtain human review, and a right to an explanation of the logic involved. PriceGuard's mandatory human-review/appeal/explainability architecture (master brief §17–18) exists specifically to give tenants a credible Art. 22 safeguard story — but **whether a specific tenant's configured workflow actually satisfies Art. 22 in their jurisdiction is a legal determination PriceGuard cannot make on the tenant's behalf.**
- **International transfers:** if PriceGuard's infrastructure or any subprocessor (e.g., an IP-intelligence or KYC vendor) sits outside the EEA, Chapter V transfer mechanisms (SCCs, adequacy) must be documented per subprocessor — data residency (EU-only processing option) should be an explicit tenant configuration, matching the "Data residency: EU" line in the user's own Privacy Control Center sketch.
- **DPIA:** profiling at this scale, especially where it can lead to account restriction/termination, is a strong candidate for **mandatory DPIA** under Art. 35 and most EU supervisory authorities' "likely high risk" lists. PriceGuard should ship a DPIA *template* pre-populated with its own processing description to accelerate each tenant's own DPIA — PriceGuard cannot complete a tenant's DPIA for them, since it also depends on the tenant's own use case and jurisdiction.
- **Records of processing (Art. 30):** both PriceGuard's own RoPA (as processor) and a generation aid for tenants' RoPA entries covering PriceGuard's processing should be planned.

---

## J. EU/German Regulatory Questions Requiring Legal Review (flagged, not answered, here)

1. Does automated **temporary restriction** (short of suspension) also count as a "similarly significant effect" under Art. 22, or only suspension/termination — this materially affects which enforcement tiers require mandatory human review by default.
2. What is the current status and expected effect of the **EU Digital Omnibus** proposal (EDPB-EDPS Joint Opinion 2/2026) on Art. 22 and profiling obligations — this is moving faster than this document can track and must be re-verified before Phase 6.
3. To what extent can "confidence-based verification requests" (e.g., asking for a billing-address re-confirmation) be treated as *not* a "decision" under Art. 22 versus already being profiling with legal effect.
4. Under German law specifically (BGB unfair-terms doctrine, and GDPR as applied by the BfDI and Land DPAs), what contractual language is required for a company to reserve the right to reprice, migrate, or terminate a subscription based on residency/usage-location evidence — this is a **contract law question for the tenant**, not something PriceGuard's platform can resolve, but PriceGuard's documentation should clearly flag it to tenants.
5. Whether GPS-derived precise location (if ever enabled by a tenant for a specific justified use case) triggers special-category-adjacent sensitivities or additional consent requirements in specific member states.
6. Cross-border data-transfer treatment for tenants using non-EU IP-intelligence or KYC subprocessors, and whether PriceGuard needs an EU-only "walled" processing tier as a product SKU.
7. Consumer-protection law interaction (e.g., whether "forced plan migration" or "recovery of contractually valid charges" as enforcement actions could be characterized as unfair commercial practices under the UCPD in some circumstances) — flagged for legal review per tenant jurisdiction, since PriceGuard explicitly must never invent legal authority for a penalty (master brief §2, §49).

**None of items 1–7 should be treated as resolved by this document.** They are gating questions for qualified EU/German counsel before Phase 6 (Enterprise Compliance) and ideally before any GA claim of "GDPR-ready."

---

## K. Proposed Architecture (conceptual — full C4/data-flow diagrams are a Phase 1 deliverable)

At a conceptual level (detailed component/technology selection deferred to Phase 1 per the master brief's own phasing, §24/39):

```
Tenant App/SDK → PriceGuard Ingestion API (auth, validation) → Event Stream
                                                                  │
                                     ┌────────────────────────────┼───────────────────────────┐
                                     ▼                             ▼                            ▼
                          Feature Pipeline (real-time)   Analytics/Feature Store (batch)   Fraud Graph builder
                                     │                             │                            │
                                     ▼                             ▼                            ▼
                             Risk Engine (rules + ML)  ←──── Model Registry / Training  ←── Graph Analytics
                                     │
                                     ▼
                             Policy Engine (tenant-configured)
                                     │
                         ┌───────────┼────────────┐
                         ▼           ▼             ▼
                 Decision API   Verification    Human Review Queue
                  (to tenant)     Workflow        + Appeals
                         │
                         ▼
              Audit/Decision Log (immutable, tenant-isolated)
```

Design principles carried from the master brief: the *fast path* (Decision API) must be able to answer with cached/precomputed features and lightweight scoring without waiting on the graph or heavy ML; graph analysis and model training are explicitly asynchronous; every box that touches personal data is subject to the tenant's retention configuration; multi-tenant isolation is enforced at the data-access layer, not just in application logic. Concrete technology choices (Postgres/ClickHouse/Kafka-compatible stream/Neo4j-or-alternative/etc.) are deliberately **not finalized in this document** — the master brief itself schedules that comparison for Phase 1, and current stable versions/alternatives should be re-verified at that time rather than pinned now in a discovery document.

---

## L. Initial Database / Domain Model (conceptual entities — ERD is a Phase 1 deliverable)

Core entities anticipated: **Tenant** (organization/company); **TenantUser** (PriceGuard dashboard user, with role); **EndAccount** (the tenant's own customer, referenced by tenant-provided ID, minimized PII); **Device** (SDK-generated identifier + attributes); **Session**; **IPObservation**; **NetworkEntity** (ASN/ISP/network-owner); **PaymentToken** (tokenized reference only — never raw card data); **RiskEvent** (an ingested signal bundle); **RiskScore** (score + confidence + evidence + model/policy version, versioned and immutable once issued); **Policy** / **Rule** (tenant-authored, versioned); **EnforcementAction**; **VerificationRequest**; **Investigation**; **Appeal**; **AuditLogEntry**; **ModelVersion**; **FeatureSnapshot**; **GraphEdge** (Account↔Device, Account↔PaymentToken, Account↔IP, etc., for the fraud graph). Every entity carries a `tenant_id` partition key as a first-class, non-optional field to make cross-tenant leakage structurally harder, not just policy-forbidden.

---

## M. MVP Scope (Phase 2 target — see master brief phasing)

Tenant management and auth; API-key issuance; risk-event ingestion API; an IP-intelligence abstraction (pluggable against a third-party provider initially rather than building proprietary IP reputation from zero); basic device-intelligence signals (privacy-conscious, minimal set); basic country-mismatch detection (declared pricing country vs. observed session country, over an observation window — *not* single-event judgments); a basic rule engine (even before full ML); an explainable 0–100 risk score with evidence; a minimal admin dashboard (Overview, Risk Events, Accounts, Policy/Rules, Audit Logs); audit logging; and — treated as MVP-critical, not deferred — a human-review/appeal path for any action beyond "warn," plus baseline retention configuration. This last point is a deliberate divergence from treating compliance tooling as a later "Enterprise" phase: given the Art. 22 analysis in §I, shipping enforcement without an appeal path is a legal-risk MVP, not a legitimate one.

---

## N. Out-of-Scope for MVP (explicitly deferred, per the master brief's own phasing)

Full ML pipeline with training/registry/drift monitoring (Phase 4); fraud graph and network visualization (Phase 5); SSO/SAML/advanced RBAC/DSAR tooling (Phase 6); the full SDK ecosystem beyond one or two reference SDKs (Phase 7); multi-region/HA scale testing (Phase 8); GDPR-readiness claims of any kind pending legal review (never claimed prematurely, per §I/J); a finalized commercial name (pending trademark clearance — tracked separately); precise legal enforceability opinions for any specific tenant's jurisdiction (always tenant's own counsel's responsibility).

---

## O. Development Roadmap

This document adopts the master brief's ten-phase roadmap (Phase 0 Discovery → Phase 1 Architecture → Phase 2 MVP → Phase 3 Advanced Analytics → Phase 4 ML → Phase 5 Fraud Graph → Phase 6 Enterprise Compliance → Phase 7 SDK Ecosystem → Phase 8 Scale → Phase 9 Production Hardening → Phase 10 Commercial Launch) without modification, since it already reflects the correct dependency order (e.g., ML only after rules-based MVP proves the data pipeline; enforcement automation only after appeal/human-review scaffolding exists). The semantic-versioning scheme (v1.0.0 initial GA, patch/minor/major cadence as specified) and the shadow-model promotion pipeline (production model vs. shadow candidate → comparison → false-positive evaluation → human approval → staged 5/25/50/100% rollout) specified in the brief are both adopted as-is for Phase 4 onward and will be elaborated with concrete tooling in that phase's kickoff document.

---

## P. Testing Strategy (elaborated per-phase; summarized here)

Testing is planned as a first-class deliverable of every phase, not a final pass: unit/integration/API/DB tests alongside each backend feature; frontend and E2E tests alongside dashboard features; multi-tenant isolation and RBAC tests from the moment multi-tenancy exists; the eight required scenarios in master brief §34 (normal use, short travel, sustained mismatch, single-session VPN, legitimate cross-border travel, gradual relocation, rotating-proxy adversary, and account-farm cluster) are adopted verbatim as the MVP's acceptance-test suite and will be encoded as synthetic-data fixtures rather than real personal data; ML-specific tests (calibration, false-positive rate by legitimate-use-case segment, drift, bias) begin in Phase 4; a red-team evasion exercise (master brief §35) is scheduled after Phase 2's MVP detection logic exists, so there is something meaningful to attack; privacy tests (retention/deletion/export/DSAR-equivalent workflows, tenant-deletion) are scheduled alongside the MVP's Privacy Control Center work, not deferred to Phase 6, given the Art. 22/DPIA exposure identified in §I.

---

## Q. Commercialisation Strategy (preliminary — full pricing/positioning work is Phase 10, informed by real usage data)

**Positioning:** "Protect regional pricing integrity without punishing legitimate travellers" — an explainable, privacy-conscious alternative to blunt IP/geo-block enforcement (the YouTube Premium account-cancellation approach is a useful negative example to position against publicly, once verified/cited responsibly).

**Competitive landscape (verified via research, see Sources):** IP/VPN-detection point solutions — MaxMind minFraud, IPQualityScore, Spur, proxycheck.io, IPGeolocation.io, VPNAPI.io — are strong at IP-level classification but are infrastructure components, not a full pricing-abuse decision/policy/appeals platform. Broader fraud platforms (Sift, Seon, Kount, Forter, Arkose Labs, DataDome, GeoComply) cover adjacent fraud/bot/geolocation-compliance problems (GeoComply in particular is strong in regulated real-money-gaming geolocation compliance) but none are positioned specifically around the "primary-country vs. pricing-country" dual-score model with a built-in Art. 22-aware human-review/appeal architecture. PriceGuard's differentiation is that narrower, more defensible niche plus the compliance-by-design posture, not "detect fraud better than everyone."

**Pricing model candidates to model unit economics against in Phase 10** (not committed yet): usage-based per 1,000 risk evaluations, a monthly platform/base fee plus usage overage, and enterprise annual contracts for large tenants needing custom SLAs/data-residency — a hybrid of the first two is the most common pattern among comparable API-based risk vendors and is the working assumption pending real market validation.

---

## R. Major Risks

1. **Naming/trademark risk:** "PriceGuard" and close variants are common security/geolocation product names; final commercial naming requires a formal clearance search before Phase 10 (explicitly deferred by the master brief itself, and by this document).
2. **Legal/regulatory risk:** Article 22 and the broader EU AI/ADM regulatory environment are actively moving (Digital Omnibus, Feb 2026 Joint Opinion) — building against a snapshot of today's guidance without a re-verification checkpoint before Phase 6 is a real risk to any "compliant" claim.
3. **False-positive reputational risk:** this is the single biggest way the product could fail commercially — a tenant that uses PriceGuard to wrongly restrict genuine travellers/expats will blame PriceGuard publicly; the false-positive-protection architecture in §F/§I is not optional polish.
4. **Adversarial adaptation risk:** once PriceGuard is used at scale, sophisticated abuse operators will study and adapt to it (master brief §32); detection cannot rely on any single static list (ASN blocklists, etc.) as a long-term moat.
5. **Data-minimization vs. detection-power tension:** the strongest behavioural signals (long observation windows, device fingerprints) are in some tension with GDPR minimization and with user trust; this trade-off must be made explicit and configurable per tenant rather than resolved silently in code.
6. **Dependency on third-party IP-intelligence/KYC vendors:** MVP architecture (§M) deliberately buys rather than builds IP reputation initially — this creates vendor lock-in and subprocessor/GDPR-transfer complexity that must be tracked (subprocessor register, §I).
7. **Scope risk relative to a solo/small founding team:** the master brief specifies an extremely large enterprise platform (56 numbered sections, 10+ phases, 7+ SDKs, ML pipeline, fraud graph, full compliance suite). This document does not shrink that ambition, but flags plainly that Phase 2 (MVP) must be genuinely minimal and real, rather than a thin shell across all 56 areas at once — building broad-but-fake beats nothing, but building narrow-but-real beats broad-but-fake, and the master brief's own engineering-quality rules (§50) forbid placeholder architecture.

---

## Sources consulted for this document

- [Best VPN & Proxy Detection APIs (2026) — provider/approach/pricing comparison](https://ipgeolocation.io/blog/what-are-the-best-vpn-and-proxy-detection-apis)
- [MaxMind minFraud pricing](https://www.g2.com/products/maxmind-minfraud/pricing)
- [Google's YouTube Premium VPN crackdown — account-location-mismatch cancellations](https://www.tomsguide.com/computing/vpns/googles-cracking-down-on-youtube-premium-vpn-trick)
- [Netflix regional pricing gap (US vs. India)](https://medium.com/@subscriptioninsider/netflix-in-india-costs-3-in-the-us-its-18-regional-pricing-exposed-ab6b58918d84)
- [EDPB — Automated decision-making, profiling and online tracking (topic page, incl. Feb 2026 EDPB-EDPS Joint Opinion on the Digital Omnibus)](https://www.edpb.europa.eu/topics/ai-and-technology/automated-decision-making-profiling-and-online-tracking_en)
- [EDPB — Automated decision-making and profiling guideline landing page](https://www.edpb.europa.eu/documents/guideline/automated-decision-making-and-profiling_en)
- [European Commission — Right to not be subject to automated individual decision-making, incl. profiling](https://commission.europa.eu/law/law-topic/data-protection/reform/rights-citizens/my-rights/can-i-be-subject-automated-individual-decision-making-including-profiling_en)

**Note:** the EDPB/EU sources establish the topic and the existence of an active regulatory process (Digital Omnibus, 2026); they are not a substitute for a qualified lawyer's opinion, and §J above lists exactly what still needs that opinion before implementation proceeds past Phase 1.

---

## What comes next (Phase 1 preview — not started)

Per the master brief's explicit sequencing rule ("do not skip the discovery phase" / "work sequentially"), the next step is **Phase 1 — Architecture**, which will produce: C4 diagrams (context/container/component), data-flow diagrams, a full database ERD, versioned API contracts (OpenAPI/GraphQL schema drafts), the security architecture document, a GDPR data map, a formal threat model (elaborating §D above with STRIDE per component), and the initial repository structure (`apps/`, `services/`, `packages/`, `sdk/`, `infra/`, `docs/adr/`, etc.) — including the first real technology-stack comparison (frontend, backend, ML services, databases, streaming, graph store) with current-version verification, since none of that was pinned in this discovery document on purpose.

Phase 1 will not begin until this Phase 0 document has been reviewed. Flag anything above that should change before that happens.
