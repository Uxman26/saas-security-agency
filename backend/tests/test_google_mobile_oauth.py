"""Mobile Google Sign-In reuses existing OAuth account linking."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models import User
from tests.helpers_company import ensure_test_company


client = TestClient(app)


def test_google_mobile_login_requires_company_id():
    resp = client.post(
        "/auth/oauth/google/mobile",
        json={"id_token": "x" * 40, "remember_me": True},
        headers={"X-Client-App": "mobile"},
    )
    assert resp.status_code in (400, 422)


def test_google_mobile_login_links_existing_user():
    co = ensure_test_company(name="Google Mobile Co", enable_mobile=True)
    from app.database import SessionLocal
    from app.auth import get_password_hash

    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .filter(User.email == "google.mobile.staff@example.com")
            .first()
        )
        if not user:
            user = User(
                email="google.mobile.staff@example.com",
                password_hash=get_password_hash("Password1!"),
                full_name="Google Mobile Staff",
                role="staff",
                company_id=co.id,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        from app.services.company_login_id_service import ensure_company_login_id

        login_id = ensure_company_login_id(db, co)
        db.commit()
    finally:
        db.close()

    profile = {
        "sub": "google-sub-mobile-1",
        "email": "google.mobile.staff@example.com",
        "full_name": "Google Mobile Staff",
        "email_verified": True,
    }

    with patch(
        "app.services.oauth_service.verify_google_id_token",
        return_value=profile,
    ), patch(
        "app.services.oauth_service.provider_configured",
        return_value=True,
    ):
        resp = client.post(
            "/auth/oauth/google/mobile",
            json={
                "id_token": "fake." + ("y" * 80),
                "company_id": login_id,
                "remember_me": True,
            },
            headers={"X-Client-App": "mobile", "User-Agent": "ControlOpsMobile/1.0"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("access_token")
    assert body.get("mfa_required") is False
