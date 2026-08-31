---
title: "Data Flow"
space: "GeoGuard AI Engineering"
parent: "Architecture"
labels: ["architecture"]
source: "docs/architecture/DATA_FLOW.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Data Flow Diagram — Risk Event Lifecycle (MVP)

```mermaid
sequenceDiagram
    participant TA as Tenant App/SDK
    participant GW as API Gateway (NestJS main.ts: helmet, CORS, throttler)
    participant Auth as Auth Guard (API key)
    participant Val as Validation Pipe (class-validator)
    participant Ing as Risk Ingestion Controller/Service
    participant DB as PostgreSQL (risk_events, features)
    participant Rule as Rule Engine
    participant Pol as Policy Engine
    participant Cache as Valkey (cached features)
    participant Audit as Audit Log

    TA->>GW: POST /v1/risk/events (API key, event payload)
    GW->>Auth: authenticate & resolve tenant
    Auth-->>GW: tenantId or 401
    GW->>Val: validate DTO (whitelist, types, required fields)
    Val-->>GW: validated payload or 400
    GW->>Ing: handle(tenantId, payload)
    Ing->>Cache: read cached account-level features (if present)
    Ing->>DB: persist RiskEvent (tenant-scoped)
    Ing->>Rule: evaluate country-mismatch + evidence rules against event + cached features
    Rule-->>Ing: RiskScore (0-100), confidence, evidence[], reasonCodes[]
    Ing->>DB: persist RiskScore (versioned, immutable)
    Ing->>Pol: evaluate tenant policy against RiskScore
    Pol-->>Ing: recommended PolicyAction (+ requiresHumanReview flag)
    Ing->>Audit: append decision record (event, score, action, versions, timestamp)
    Ing-->>TA: 200 { riskScore, confidence, likelyPrimaryCountry, policyAction, reasonCodes }
    opt requiresHumanReview
        Ing->>DB: create Investigation (status=PENDING)
    end
```

## Notes

- The **fast path** shown above uses only cached/precomputed features and rule evaluation —
  no synchronous call to any ML model or third-party enrichment API blocks the response
  (Phase 0 §29 latency requirement). Any expensive enrichment (IP-intelligence provider
  lookup) that the MVP does perform is invoked once per new IP and its result cached, not
  repeated per event.
- Internal analyst-facing evidence (full feature values, exact thresholds) and the
  customer-facing explanation returned in the API response are **rendered from the same
  evidence record through two different serializers** (`InternalExplanationSerializer` vs
  `CustomerExplanationSerializer`) so the detailed mechanism is never leaked to the tenant's
  own end users through the API response, per brief §18.
- Asynchronous paths (analytics aggregation, model training, fraud graph) are explicitly
  out of MVP scope (see ADR-0002) and are not drawn here to avoid documenting containers
  that do not exist yet.
