from __future__ import annotations

import requests

from .errors import PriceGuardApiError, PriceGuardTimeoutError
from .types import RiskDecision, RiskEventInput

_API_KEY_HEADER = "x-priceguard-api-key"
_DEFAULT_TIMEOUT_SECONDS = 10.0


class PriceGuardClient:
    """Official Python client for the PriceGuard AI risk-scoring API.

    Uses `requests` under the hood; a `session` can be injected in tests to avoid a real
    network stack (see tests/test_client_unit.py) without a mocking library beyond
    `responses`. Real behaviour is exercised against a locally booted instance of
    apps/api in tests/test_client_e2e.py — see that file's header comment.
    """

    def __init__(self, base_url: str, api_key: str, timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS, session: requests.Session | None = None):
        if not base_url:
            raise ValueError("PriceGuardClient requires a base_url")
        if not api_key or "." not in api_key:
            raise ValueError('PriceGuardClient requires an api_key in "<prefix>.<secret>" form')
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._session = session or requests.Session()

    def create_risk_event(self, event: RiskEventInput) -> RiskDecision:
        """POSTs one risk event to /v1/risk/events and returns the resulting decision.

        Raises PriceGuardApiError on a non-2xx response and PriceGuardTimeoutError if the
        request exceeds timeout_seconds.
        """
        url = f"{self._base_url}/v1/risk/events"
        try:
            response = self._session.post(
                url,
                json=event.to_api_dict(),
                headers={_API_KEY_HEADER: self._api_key, "content-type": "application/json"},
                timeout=self._timeout_seconds,
            )
        except requests.exceptions.Timeout as exc:
            raise PriceGuardTimeoutError(self._timeout_seconds) from exc

        body = response.json() if response.content else None
        if not response.ok:
            raise PriceGuardApiError(response.status_code, body)
        if not isinstance(body, dict):
            raise PriceGuardApiError(response.status_code, body)
        return RiskDecision.from_api_dict(body)
