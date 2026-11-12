"""Shared helpers so backend tests do not depend on a pre-seeded Company id=1."""

from __future__ import annotations

from app.auth import get_password_hash
from app.database import SessionLocal
from app.models import Company, Role, User
from app.services.company_login_id_service import ensure_company_login_id
from app.services.module_service import dump_modules, parse_modules


def ensure_test_company(
    *,
    name: str = "ControlOps Test Co",
    admin_email: str = "test.company.admin@example.com",
    enable_mobile: bool = True,
) -> Company:
    """Create or reuse an active company (with admin user) for hermetic tests."""
    db = SessionLocal()
    try:
        co = (
            db.query(Company)
            .filter(Company.name == name)
            .order_by(Company.id.asc())
            .first()
        )
        if co is None:
            admin = db.query(User).filter(User.email == admin_email).first()
            if admin is None:
                admin = User(
                    email=admin_email,
                    full_name="Test Company Admin",
                    password_hash=get_password_hash("AdminTest1!"),
                    role="admin",
                    is_active=True,
                    email_verified=True,
                )
                db.add(admin)
                db.flush()
            modules = {"mobile_apps": True} if enable_mobile else {}
            co = Company(
                name=name,
                admin_id=admin.id,
                account_status="active",
                subscription_status="active",
                subscription_tier="basic",
                enabled_modules_json=dump_modules(modules),
            )
            db.add(co)
            db.flush()
            admin.company_id = co.id
        else:
            if not co.subscription_status or co.subscription_status == "pending":
                co.subscription_status = "active"
            if hasattr(co, "account_status") and not co.account_status:
                co.account_status = "active"
            modules = parse_modules(co.enabled_modules_json)
            if enable_mobile:
                modules = {**modules, "mobile_apps": True}
            co.enabled_modules_json = dump_modules(modules)
        ensure_company_login_id(db, co)
        db.commit()
        db.refresh(co)
        # Detach a simple snapshot id for callers that reopen sessions.
        return db.get(Company, co.id)  # type: ignore[return-value]
    finally:
        db.close()


def ensure_staff_user(
    *,
    email: str,
    password: str = "StaffTest1!",
    full_name: str = "Staff Test",
    company_name: str = "ControlOps Test Co",
) -> tuple[str, str, str, int]:
    """Returns (email, password, public_login_id, company_pk)."""
    co = ensure_test_company(name=company_name, enable_mobile=True)
    db = SessionLocal()
    try:
        company = db.get(Company, co.id)
        assert company is not None
        login_id = ensure_company_login_id(db, company)
        staff_role = db.query(Role).filter(Role.slug == "staff").first()
        if staff_role is None:
            # Tenant-scoped roles may exist — try ensuring defaults if service available.
            try:
                from app.services import role_service

                role_service.ensure_roles_for_company(db, company.id)
                staff_role = role_service.get_role_by_slug(db, company.id, "staff")
            except Exception:
                staff_role = db.query(Role).filter(Role.slug == "staff").first()
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                full_name=full_name,
                password_hash=get_password_hash(password),
                role="staff",
                role_id=staff_role.id if staff_role else None,
                company_id=company.id,
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
            user.company_id = company.id
        db.commit()
        return email, password, login_id, company.id
    finally:
        db.close()
