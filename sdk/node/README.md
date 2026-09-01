# @priceguard/sdk-node

Official Node.js/TypeScript client SDK for the PriceGuard AI risk-scoring ingestion API
(`POST /v1/risk/events`). Built in Phase 7 — see `docs/adr/0009-sdk-ecosystem-scope.md` for
the full honest scope statement (what's covered, what isn't).

## Install

This package is not yet published to a package registry (see the ADR). For now, use it as
a local workspace dependency or copy `dist/` after running `npm run build`.

## Usage

```ts
import { PriceGuardClient } from '@priceguard/sdk-node';

const client = new PriceGuardClient({
  baseUrl: 'https://api.priceguard.example',
  apiKey: 'gg_live_abcdef.your-secret-here', // "<prefix>.<secret>" — see your tenant's API Keys settings
});

const decision = await client.createRiskEvent({
  accountId: 'customer-123',
  sdkSessionId: crypto.randomUUID(),
  ipAddress: req.ip,
  deviceId: deviceFingerprint,
  timestamp: new Date().toISOString(),
  pricingCountry: 'US',
  eventType: 'LOGIN',
});

if (decision.requiresHumanReview) {
  // route to your own manual-review queue
}
```

## Error handling

- `PriceGuardApiError` — thrown for any non-2xx HTTP response; carries `.status` and the
  parsed response `.body`.
- `PriceGuardTimeoutError` — thrown if a request exceeds `timeoutMs` (default 10s).

## Keeping this SDK in sync with the API

This client's request/response shapes are hand-written to mirror
`apps/api/src/risk/dto/risk-event-input.dto.ts` and `RiskDecisionResponse` in
`apps/api/src/risk/risk.service.ts`. This is **not** generated from
`docs/architecture/openapi.yaml` — a documented Phase 7 gap (see the ADR): a schema drift
between the API and this SDK would currently only be caught by
`apps/api/test/sdk-node-client.e2e-spec.ts` (which runs this SDK against a real, live
instance of the API), not by a build-time contract check.

## Testing

- `npm test` — fast unit tests against a stubbed `fetch` (`test/client.unit.spec.ts`),
  covering the client's own request-building/error-handling logic.
- `apps/api/test/sdk-node-client.e2e-spec.ts` — proves this SDK against a real, running
  instance of the API (real Postgres, real HTTP, real API-key auth). Run via the API's own
  `npm run test:e2e:reset` (it's one of that suite's spec files, since it needs the API's
  test-app bootstrapping and seed helpers).
