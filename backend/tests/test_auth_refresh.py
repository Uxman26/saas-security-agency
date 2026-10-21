from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import UserSession
from tests.test_mobile_auth_me import _ensure_staff_user


def test_refresh_revives_idle_mobile_session():
    email, password, login_id = _ensure_staff_user()
    client = TestClient(app)
    headers = {
        "User-Agent": "ControlOpsMobile/1.0",
        "X-Client-App": "mobile",
    }
    login = client.post(
        "/auth/login",
        json={
            "company_id": login_id,
            "email": email,
            "password": password,
            "remember_me": False,
        },
        headers=headers,
    )
    assert login.status_code == 200, login.text
    token = login.json().get("access_token")
    assert token

    db = SessionLocal()
    try:
        row = (
            db.query(UserSession)
            .filter(UserSession.revoked_at.is_(None))
            .order_by(UserSession.id.desc())
            .first()
        )
        assert row is not None
        row.last_seen_at = datetime.now(timezone.utc) - timedelta(hours=2)
        row.idle_timeout_minutes = 30
        db.commit()
    finally:
        db.close()

    me = client.get("/auth/me", headers={**headers, "Authorization": f"Bearer {token}"})
    assert me.status_code == 401, me.text

    refresh = client.post("/auth/refresh", headers={**headers, "Authorization": f"Bearer {token}"})
    assert refresh.status_code == 200, refresh.text
    next_token = refresh.json().get("access_token")
    assert next_token

    me2 = client.get("/auth/me", headers={**headers, "Authorization": f"Bearer {next_token}"})
    assert me2.status_code == 200, me2.text
    assert me2.json()["email"] == email


def test_refresh_rejects_missing_token():
    client = TestClient(app)
    res = client.post("/auth/refresh")
    assert res.status_code == 401
