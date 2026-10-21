from __future__ import annotations

from fastapi import HTTPException

from app.services.public_rate_limit import enforce_public_rate, reset_for_tests


class _Client:
    host = "rate-limit-test"


class _Request:
    client = _Client()


def test_enforce_public_rate_trips_at_limit():
    reset_for_tests()
    req = _Request()
    for _ in range(8):
        enforce_public_rate(req, key="unit-test", limit=8)
    try:
        enforce_public_rate(req, key="unit-test", limit=8)
        assert False, "expected 429"
    except HTTPException as exc:
        assert exc.status_code == 429
