"""Same email, two tenants: one login, isolated employment records."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth import get_password_hash
from app.database import SessionLocal
from app.main import app
from app.models import Company, Guard, Role, User
from app.schemas import CompanyUserCreate
from app.services import membership_service, role_service, user_service
from app.services.company_login_id_service import ensure_company_login_id
from app.services.module_service import dump_modules, parse_modules


def _staff_role(db, company_id: int) -> Role:
    role_service.ensure_roles_for_company(db, company_id)
    role = role_service.get_role_by_slug(db, company_id, "staff")
    assert role is not None
    return role


def _activate_company(co: Company) -> None:
    if not co.subscription_status or co.subscription_status == "pending":
        co.subscription_status = "active"
    co.enabled_modules_json = dump_modules(
        {**parse_modules(co.enabled_modules_json), "mobile_apps": True}
    )


def test_same_email_can_join_second_tenant_and_switch():
    db = SessionLocal()
    try:
        co_a = db.get(Company, 1)
        assert co_a is not None
        _activate_company(co_a)
        role_a = _staff_role(db, co_a.id)

        email = "shared.staff.membership@example.com"
        password = "StaffTest1!"
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                full_name="Shared Staff",
                password_hash=get_password_hash(password),
                role="staff",
                role_id=role_a.id,
                company_id=co_a.id,
                is_active=True,
                email_verified=True,
            )
            db.add(user)
            db.flush()
        membership_service.upsert_membership(
            db,
            user=user,
            company_id=co_a.id,
            role=role_a,
            guard_id=user.guard_id,
            client_id=None,
            make_active_context=True,
        )
        db.commit()
        db.refresh(user)
        user_id = user.id

        admin_email = "tss.admin.membership@example.com"
        admin_b = db.query(User).filter(User.email == admin_email).first()
        if not admin_b:
            admin_b = User(
                email=admin_email,
                full_name="TSS Admin",
                password_hash=get_password_hash(password),
                role="admin",
                is_active=True,
                email_verified=True,
            )
            db.add(admin_b)
            db.flush()
        co_b = db.query(Company).filter(Company.admin_id == admin_b.id).first()
        if not co_b:
            co_b = Company(
                name="TSS Test Tenant",
                admin_id=admin_b.id,
                subscription_status="active",
                subscription_tier="basic",
                enabled_modules_json=dump_modules({"mobile_apps": True}),
            )
            db.add(co_b)
            db.flush()
        admin_b.company_id = co_b.id
        role_b = _staff_role(db, co_b.id)
        guard_b = (
            db.query(Guard)
            .filter(Guard.company_id == co_b.id, Guard.email == email)
            .first()
        )
        if not guard_b:
            guard_b = Guard(company_id=co_b.id, full_name="Shared Staff", email=email)
            db.add(guard_b)
        db.commit()
        db.refresh(guard_b)
        co_b_id = co_b.id
        guard_b_id = guard_b.id
        role_b_id = role_b.id
    finally:
        db.close()

    db = SessionLocal()
    try:
        linked = db.query(User).filter(User.id == user_id).first()
        assert linked is not None
        if not membership_service.belongs_to_company(db, linked, co_b_id):
            linked = user_service.create_company_user(
                db,
                co_b_id,
                CompanyUserCreate(
                    email=email,
                    password="IgnoredPass1!",
                    full_name="Shared Staff",
                    role_id=role_b_id,
                    guard_id=guard_b_id,
                ),
            )
        assert linked.id == user_id
        assert linked.company_id == 1
        assert membership_service.belongs_to_company(db, linked, 1)
        assert membership_service.belongs_to_company(db, linked, co_b_id)
        opts = membership_service.list_company_options(db, linked)
        assert {o["company_id"] for o in opts} >= {1, co_b_id}

        switched = membership_service.switch_company(db, linked, co_b_id)
        assert switched.company_id == co_b_id
        assert switched.guard_id == guard_b_id
        assert switched.role == "staff"

        switched_back = membership_service.switch_company(db, switched, 1)
        assert switched_back.company_id == 1
        login_a = ensure_company_login_id(db, db.get(Company, 1))
        login_b = ensure_company_login_id(db, db.get(Company, co_b_id))
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    headers = {"User-Agent": "ControlOpsMobile/1.0", "X-Client-App": "mobile"}
    login = client.post(
        "/auth/login",
        json={"company_id": login_a, "email": email, "password": password, "remember_me": True},
        headers=headers,
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    me = client.get("/auth/me", headers={**headers, "Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    company_ids = {c["company_id"] for c in body.get("companies") or []}
    assert 1 in company_ids
    assert co_b_id in company_ids
    assert body["company_id"] == 1
    assert body.get("company_login_id") == login_a

    other = client.post(
        "/auth/login",
        json={"company_id": login_b, "email": email, "password": password, "remember_me": True},
        headers=headers,
    )
    assert other.status_code == 200, other.text
    other_me = client.get(
        "/auth/me",
        headers={**headers, "Authorization": f"Bearer {other.json()['access_token']}"},
    )
    assert other_me.status_code == 200, other_me.text
    assert other_me.json()["company_id"] == co_b_id
    assert other_me.json()["guard_id"] == guard_b_id
    assert other_me.json().get("company_login_id") == login_b

    switched = client.post(
        "/auth/switch-company",
        json={"company_id": co_b_id},
        headers={**headers, "Authorization": f"Bearer {token}"},
    )
    assert switched.status_code == 403, switched.text
