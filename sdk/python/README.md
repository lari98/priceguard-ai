# priceguard-sdk (Python)

Official Python client SDK for the PriceGuard AI risk-scoring ingestion API
(`POST /v1/risk/events`). Built in Phase 7 — see
`docs/adr/0009-sdk-ecosystem-scope.md` for the full honest scope statement.

## Install

Not yet published to PyPI (see the ADR). For now:

```bash
pip install -e ./sdk/python
```

## Usage

```python
from priceguard_sdk import PriceGuardClient
from priceguard_sdk.types import RiskEventInput

client = PriceGuardClient(
    base_url="https://api.priceguard.example",
    api_key="gg_live_abcdef.your-secret-here",  # "<prefix>.<secret>"
)

decision = client.create_risk_event(RiskEventInput(
    account_id="customer-123",
    sdk_session_id=str(uuid.uuid4()),
    ip_address=request_ip,
    device_id=device_fingerprint,
    timestamp=datetime.now(timezone.utc).isoformat(),
    pricing_country="US",
    event_type="LOGIN",
))

if decision.requires_human_review:
    ...  # route to your own manual-review queue
```

## Error handling

- `PriceGuardApiError` — raised for any non-2xx HTTP response; carries `.status` and the
  parsed response `.body`.
- `PriceGuardTimeoutError` — raised if a request exceeds `timeout_seconds` (default 10s).

## Keeping this SDK in sync with the API

Hand-written to mirror the same DTOs as the Node SDK (see its README) — not generated from
the OpenAPI spec. A schema drift is currently only caught by
`tests/test_client_e2e.py`, which boots a real instance of `apps/api` as a subprocess.

## Testing

```bash
cd sdk/python
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m pytest tests/                 # unit tests (stubbed HTTP via `responses`) + the
                                         # real e2e test below
python -m mypy priceguard_sdk           # strict type-checking
```

`tests/test_client_e2e.py` spawns `apps/api/scripts/boot-for-sdk-e2e.ts` as a subprocess
(via `npx ts-node`) against the same `priceguard_test` Postgres database the Node/Nest e2e
suite uses, and drives this SDK against the real, running API over real HTTP. It is
automatically **skipped** (not failed) if `npx`/Node isn't available in the environment
running these tests — the package itself has no Node dependency; only this one test does,
to reach a real server.
