# License decision notes

**No license has been finalized or applied to this repository yet.** This file records the
decision that still needs to be made, and why it is deferred rather than defaulted.

## Options under consideration

1. **Proprietary / all-rights-reserved (closed source).** Most likely fit for a commercial
   B2B SaaS product where the core risk-scoring logic is part of the competitive moat.
   Downside: forgoes any open-source-community credibility/contribution benefit.
2. **Source-available with a non-compete clause (e.g., BSL-style).** Lets the code be
   read/audited (valuable for enterprise security reviews and the "explainable" positioning)
   while preventing a competitor from operating a hosted clone.
3. **Open-core:** SDKs (`sdk/`) and possibly the policy-rule DSL published under a permissive
   license (MIT/Apache-2.0) to drive integration adoption, while the core risk engine,
   ML pipeline, and dashboard stay proprietary.

## Why this is not decided yet

The master brief treats this as a serious open-source-visible/enterprise repository
structurally, but does not instruct a specific license, and a license choice interacts with
the eventual commercial/pricing strategy (Phase 10) and any investor/legal counsel input.
Shipping without a LICENSE file is intentional for now — it defaults to
"all rights reserved" under most jurisdictions' copyright law, which is a safe default
while the decision above is pending, rather than an oversight.

**Action required before any public repository visibility or SDK release:** pick one of
the above (or a variant), add a `LICENSE` file, and update this note to reflect the decision
and its rationale.
