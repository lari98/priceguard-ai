"""Phase 7 (SDK Ecosystem) — proves the official Python SDK actually talks to a real,
running instance of apps/api (real Postgres, real HTTP listener, real API-key auth), not
just a stubbed `responses` mock (see test_client_unit.py for the fast stubbed-HTTP tests
covering the client's own request-building logic).

Boots apps/api/scripts/boot-for-sdk-e2e.ts as a subprocess against the same
`priceguard_test` database the Node/Nest e2e suite uses (DATABASE_URL_TEST, falling back
to the same default connection string apps/api/scripts/run-with-test-db.js uses), reads
the single JSON line it prints once ready, and drives the real SDK against it over real
HTTP. Skipped (not failed) when Node/npm is not available in the environment running these
tests, since the Python package itself has no Node dependency — only this particular test
does, to reach a real server instance.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

from priceguard_sdk import PriceGuardApiError, PriceGuardClient
from priceguard_sdk.types import RiskEventInput

API_DIR = Path(__file__).resolve().parents[3] / "apps" / "api"
BOOT_SCRIPT = API_DIR / "scripts" / "boot-for-sdk-e2e.ts"
READY_TIMEOUT_SECONDS = 60


def _npx_available() -> bool:
    return shutil.which("npx") is not None and BOOT_SCRIPT.exists()


@pytest.fixture(scope="module")
def live_server():
    if not _npx_available():
        pytest.skip("npx/apps-api not available in this environment")

    env = dict(os.environ)
    env["DATABASE_URL"] = env.get(
        "DATABASE_URL_TEST",
        "postgresql://priceguard:priceguard_dev_password@localhost:5432/priceguard_test",
    )

    proc = subprocess.Popen(
        ["npx", "ts-node", str(BOOT_SCRIPT)],
        cwd=str(API_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    deadline = time.monotonic() + READY_TIMEOUT_SECONDS
    ready_line = None
    try:
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                stderr = proc.stderr.read() if proc.stderr else ""
                pytest.fail(f"boot-for-sdk-e2e.ts exited early (code {proc.returncode}):\n{stderr}")
            line = proc.stdout.readline() if proc.stdout else ""
            if line.strip():
                ready_line = line.strip()
                break
            time.sleep(0.2)

        if ready_line is None:
            pytest.fail("boot-for-sdk-e2e.ts never printed its ready line within the timeout")

        info = json.loads(ready_line)
        yield info
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def test_real_ingest_through_python_sdk(live_server):
    client = PriceGuardClient(base_url=live_server["baseUrl"], api_key=live_server["apiKey"])

    decision = client.create_risk_event(
        RiskEventInput(
            account_id="py-sdk-account-1",
            sdk_session_id="py-sdk-session-1",
            ip_address="198.51.100.9",
            device_id="py-sdk-device-1",
            timestamp="2026-01-01T00:00:00.000Z",
            pricing_country="US",
            event_type="LOGIN",
        )
    )

    assert isinstance(decision.risk_score, (int, float))
    assert decision.policy_version
    assert decision.model_version
    assert isinstance(decision.reason_codes, list)


def test_real_401_surfaces_as_api_error(live_server):
    client = PriceGuardClient(base_url=live_server["baseUrl"], api_key="gg_bogus.notreal")

    with pytest.raises(PriceGuardApiError) as exc_info:
        client.create_risk_event(
            RiskEventInput(
                account_id="py-sdk-account-2",
                sdk_session_id="py-sdk-session-2",
                ip_address="198.51.100.10",
                device_id="py-sdk-device-2",
                timestamp="2026-01-01T00:00:00.000Z",
                pricing_country="US",
                event_type="LOGIN",
            )
        )
    assert exc_info.value.status == 401


if __name__ == "__main__":
    sys.exit(pytest.main([__file__]))
