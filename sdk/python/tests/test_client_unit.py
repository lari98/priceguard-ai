import pytest
import responses

from priceguard_sdk import PriceGuardApiError, PriceGuardClient
from priceguard_sdk.types import RiskEventInput

SAMPLE = RiskEventInput(
    account_id="acct-1",
    sdk_session_id="sess-1",
    ip_address="203.0.113.5",
    device_id="device-1",
    timestamp="2026-01-01T00:00:00.000Z",
    pricing_country="US",
    event_type="LOGIN",
)


def test_rejects_malformed_api_key():
    with pytest.raises(ValueError, match="api_key"):
        PriceGuardClient(base_url="http://x", api_key="no-dot")


def test_rejects_empty_base_url():
    with pytest.raises(ValueError, match="base_url"):
        PriceGuardClient(base_url="", api_key="p.s")


@responses.activate
def test_sends_api_key_header_and_parses_2xx_response():
    responses.add(
        responses.POST,
        "http://localhost:9999/v1/risk/events",
        json={
            "riskScore": 12,
            "confidence": "HIGH",
            "likelyPrimaryCountry": {"US": 0.9},
            "vpnProbability": 0.1,
            "travelProbability": 0.0,
            "policyAction": "ALLOW",
            "requiresHumanReview": False,
            "reasonCodes": [],
            "modelVersion": "rule-engine-v1",
            "policyVersion": "v1",
            "investigationId": None,
        },
        status=201,
    )

    client = PriceGuardClient(base_url="http://localhost:9999/", api_key="gg_test.secret")
    decision = client.create_risk_event(SAMPLE)

    sent = responses.calls[0].request
    assert sent.headers["x-priceguard-api-key"] == "gg_test.secret"
    assert sent.url == "http://localhost:9999/v1/risk/events"
    assert decision.risk_score == 12
    assert decision.policy_action == "ALLOW"


@responses.activate
def test_raises_api_error_on_non_2xx_response():
    responses.add(
        responses.POST,
        "http://localhost:9999/v1/risk/events",
        json={"message": "Invalid API key"},
        status=401,
    )

    client = PriceGuardClient(base_url="http://localhost:9999", api_key="gg_test.secret")
    with pytest.raises(PriceGuardApiError) as exc_info:
        client.create_risk_event(SAMPLE)

    assert exc_info.value.status == 401
    assert str(exc_info.value) == "Invalid API key"
