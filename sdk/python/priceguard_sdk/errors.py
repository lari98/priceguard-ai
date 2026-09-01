from __future__ import annotations

from typing import Any


class PriceGuardApiError(Exception):
    def __init__(self, status: int, body: Any):
        self.status = status
        self.body = body
        message = body.get("message") if isinstance(body, dict) and "message" in body else f"PriceGuard API request failed with status {status}"
        super().__init__(message)


class PriceGuardTimeoutError(Exception):
    def __init__(self, timeout_seconds: float):
        super().__init__(f"PriceGuard API request timed out after {timeout_seconds}s")
