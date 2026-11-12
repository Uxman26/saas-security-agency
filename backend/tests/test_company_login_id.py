"""Public Company ID at login is distinct from companies.id and pins the session."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth import SUPER_ADMIN_ROLE, get_password_hash
from app.database import SessionLocal
from app.main import app
from app.models import Company, NotificationTemplate, Role, User
from app.services.company_login_id_service import (
    PLATFORM_LOGIN_ID,
    ensure_company_login_id,
    normalize_login_id,
)
from app.services.module_service import dump_modules, parse_modules


def _staff_login() -> tuple[str, str, str, int]:
    from tests.helpers_company import ensure_staff_user

    return ensure_staff_user(
        email="company.login.id.staff@example.com",
        full_name="Company Login Staff",
    )


def test_company_login_id_is_not_the_database_id():
    email, password, login_id, company_pk = _staff_login()
    assert login_id
    assert login_id != str(company_pk)
    assert login_id != PLATFORM_LOGIN_ID
    assert normalize_login_id("co-7k2m-9qp4") == "CO7K2M9QP4"


def test_login_requires_company_id():
    email, password, _, _ = _staff_login()
    client = TestClient(app)
    missing = client.post("/auth/login", json={"email": email, "password": password, "remember_me": True})
    assert missing.status_code == 401, missing.text
    detail = missing.json().get("detail")
    assert "incorrect" in str(detail).lower()


def test_login_rejects_unknown_company_id():
    email, password, _, _ = _staff_login()
    client = TestClient(app)
    bad = client.post(
        "/auth/login",
        json={"company_id": "COZZZZZZZZ", "email": email, "password": password, "remember_me": True},
    )
    assert bad.status_code == 401, bad.text
    detail = bad.json().get("detail")
    assert "Company ID" in str(detail)


def test_login_with_public_company_id_pins_tenant():
    email, password, login_id, company_pk = _staff_login()
    client = TestClient(app)
    login = client.post(
        "/auth/login",
        json={"company_id": login_id.lower(), "email": email, "password": password, "remember_me": True},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["company_id"] == company_pk
    assert body.get("company_login_id") == login_id


def test_welcome_template_includes_company_id():
    db = SessionLocal()
    try:
        row = db.query(NotificationTemplate).filter(NotificationTemplate.key == "welcome_onboarding").first()
        assert row is not None
        assert "{{company_login_id}}" in (row.body or "")
    finally:
        db.close()


def test_existing_numeric_ids_are_internal_and_not_used_at_login():
    from tests.helpers_company import ensure_test_company

    ensure_test_company(name="ControlOps Test Co")
    db = SessionLocal()
    try:
        from sqlalchemy.exc import IntegrityError

        from app.services.admin_platform_service import company_admin_out
        from app.services.company_login_id_service import backfill_company_login_ids

        before = [(c.id, c.login_id) for c in db.query(Company).order_by(Company.id).all()]
        assert before, "expected existing tenants"
        assigned = backfill_company_login_ids(db)
        db.expire_all()
        rows = db.query(Company).order_by(Company.id).all()
        after = [(c.id, c.login_id) for c in rows]
        assert [row[0] for row in after] == [row[0] for row in before]
        if all(code for _, code in before):
            assert assigned == 0
            assert after == before
        codes = [c.login_id for c in rows]
        assert all(code and not str(code).isdigit() for code in codes)
        assert all(str(c.id) != (c.login_id or "") for c in rows)
        assert len(codes) == len(set(codes))
        first = rows[0]
        kept = first.login_id
        pk = first.id
        assert ensure_company_login_id(db, first) == kept
        assert first.id == pk
        admin = company_admin_out(db, first)
        assert admin["id"] == pk
        assert admin["login_id"] == kept
        assert admin["login_id"] != str(pk)

        second = rows[1] if len(rows) > 1 else None
        if second is not None and first.login_id:
            original = second.login_id
            second_id = second.id
            second.login_id = first.login_id
            try:
                db.flush()
                raise AssertionError("duplicate login_id should be rejected")
            except IntegrityError:
                db.rollback()
            db.expire_all()
            second = db.get(Company, second_id)
            assert second is not None
            assert second.login_id == original
            assert second.id == second_id
    finally:
        db.close()

    email, password, login_id, company_pk = _staff_login()
    client = TestClient(app)
    short_numeric = client.post(
        "/auth/login",
        json={"company_id": str(company_pk), "email": email, "password": password, "remember_me": True},
    )
    assert short_numeric.status_code == 422, short_numeric.text
    padded_numeric = client.post(
        "/auth/login",
        json={"company_id": str(company_pk).zfill(3), "email": email, "password": password, "remember_me": True},
    )
    assert padded_numeric.status_code == 401, padded_numeric.text
    ok = client.post(
        "/auth/login",
        json={"company_id": login_id, "email": email, "password": password, "remember_me": True},
    )
    assert ok.status_code == 200, ok.text


def _super_admin_login() -> tuple[str, str]:
    db = SessionLocal()
    try:
        email = "company.login.superadmin@example.com"
        password = "SuperAdmin1!"
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                full_name="Platform Super Admin",
                password_hash=get_password_hash(password),
                role=SUPER_ADMIN_ROLE,
                company_id=None,
                is_active=True,
                email_verified=True,
                mfa_enabled=False,
            )
            db.add(user)
        else:
            user.password_hash = get_password_hash(password)
            user.role = SUPER_ADMIN_ROLE
            user.company_id = None
            user.is_active = True
            user.email_verified = True
            user.mfa_enabled = False
        db.commit()
        return email, password
    finally:
        db.close()


def test_super_admin_login_without_company_id():
    email, password = _super_admin_login()
    client = TestClient(app)
    missing = client.post("/auth/login", json={"email": email, "password": password, "remember_me": True})
    assert missing.status_code == 200, missing.text
    token = missing.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["role"] == SUPER_ADMIN_ROLE
    assert body.get("company_id") in (None, 0)
    hq = client.get("/admin/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert hq.status_code == 200, hq.text


def test_super_admin_login_still_accepts_platform_company_id():
    email, password = _super_admin_login()
    client = TestClient(app)
    ok = client.post(
        "/auth/login",
        json={"company_id": PLATFORM_LOGIN_ID, "email": email, "password": password, "remember_me": True},
    )
    assert ok.status_code == 200, ok.text


def test_tenant_cannot_use_super_admin_login_or_admin_api():
    email, password, login_id, _ = _staff_login()
    client = TestClient(app)
    denied = client.post("/auth/login", json={"email": email, "password": password, "remember_me": True})
    assert denied.status_code == 401, denied.text
    tenant = client.post(
        "/auth/login",
        json={"company_id": login_id, "email": email, "password": password, "remember_me": True},
    )
    assert tenant.status_code == 200, tenant.text
    token = tenant.json()["access_token"]
    hq = client.get("/admin/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert hq.status_code == 403, hq.text


def test_ensure_does_not_replace_existing_company_id():
    db = SessionLocal()
    try:
        co = db.get(Company, 1)
        assert co is not None
        first = ensure_company_login_id(db, co)
        second = ensure_company_login_id(db, co)
        third = ensure_company_login_id(db, co)
        assert first == second == third
        assert co.id == 1
    finally:
        db.close()
