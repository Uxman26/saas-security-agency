"""Regression: mobile login must be able to call GET /auth/me afterwards.

A local `from app.models import Company` inside get_current_user previously made
Company an unbound local on the mobile entitlement branch, so staff/admin mobile
sign-in returned a token then failed on /auth/me with a generic 500.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.database import SessionLocal
from app.main import app
from app.models import Company, Role, User
from app.services.company_login_id_service import ensure_company_login_id
from app.services.module_service import dump_modules, parse_modules


def _ensure_staff_user() -> tuple[str, str, str]:
    db = SessionLocal()
    try:
        co = db.get(Company, 1)
        assert co is not None
        login_id = ensure_company_login_id(db, co)
        if not co.subscription_status or co.subscription_status == "pending":
            co.subscription_status = "active"
        co.enabled_modules_json = dump_modules(
            {**parse_modules(co.enabled_modules_json), "mobile_apps": True}
        )
        staff_role = db.query(Role).filter(Role.slug == "staff").first()
        email = "staff.mobile.regression@example.com"
        password = "StaffTest1!"
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                full_name="Staff Mobile Regression",
                password_hash=get_password_hash(password),
                role="staff",
                role_id=staff_role.id if staff_role else None,
                company_id=co.id,
                is_active=True,
                email_verified=True,
            )
            db.add(user)
        else:
            user.password_hash = get_password_hash(password)
            user.is_active = True
            user.email_verified = True
            user.role = "staff"
            user.role_id = staff_role.id if staff_role else user.role_id
            user.company_id = co.id
        db.commit()
        return email, password, login_id
    finally:
        db.close()


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
