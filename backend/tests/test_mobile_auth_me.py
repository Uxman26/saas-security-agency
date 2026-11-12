"""Regression: mobile login must be able to call GET /auth/me afterwards.

A local `from app.models import Company` inside get_current_user previously made
Company an unbound local on the mobile entitlement branch, so staff/admin mobile
sign-in returned a token then failed on /auth/me with a generic 500.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.helpers_company import ensure_staff_user


def _ensure_staff_user() -> tuple[str, str, str]:
    email, password, login_id, _ = ensure_staff_user(
        email="staff.mobile.regression@example.com",
        full_name="Staff Mobile Regression",
    )
    return email, password, login_id


def test_staff_mobile_login_then_me():
    email, password, login_id = _ensure_staff_user()
    client = TestClient(app)
    headers = {
        "User-Agent": "ControlOpsMobile/1.0",
        "X-Client-App": "mobile",
    }
    login = client.post(
        "/auth/login",
        json={"company_id": login_id, "email": email, "password": password, "remember_me": True},
        headers=headers,
    )
    assert login.status_code == 200, login.text
    token = login.json().get("access_token")
    assert token

    me = client.get(
        "/auth/me",
        headers={**headers, "Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["email"] == email
    assert (body.get("role") or "").lower() == "staff"


def test_staff_web_login_still_works():
    email, password, login_id = _ensure_staff_user()
    client = TestClient(app)
    login = client.post(
        "/auth/login",
        json={"company_id": login_id, "email": email, "password": password, "remember_me": True},
        headers={"User-Agent": "Mozilla/5.0"},
    )
    assert login.status_code == 200, login.text
    token = login.json().get("access_token")
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0"})
    assert me.status_code == 200, me.text
