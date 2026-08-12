from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException
from typing import List, Any, Optional
from app.models import Guard
from app.schemas import GuardCreate
from app.services.company_service import get_company_by_user_id
from app.services.plan_enforcement import enforce_guard_quota
from app.services import audit_service
from app.services import contractor_scope


# Carried on GuardCreate to drive portal-login creation; not columns on Guard, so they
# must never reach the model constructor or the update setattr loop.
_NON_COLUMN_FIELDS = ("create_login", "login_password")


def _payload(guard: GuardCreate, *, only_set: bool = False) -> dict[str, Any]:
    data = (
        guard.model_dump(exclude_unset=only_set)
        if hasattr(guard, "model_dump")
        else guard.dict(exclude_unset=only_set)
    )
    for f in _NON_COLUMN_FIELDS:
        data.pop(f, None)
    if not data.get("full_name"):
        fn = (data.get("first_name") or "").strip()
        ln = (data.get("last_name") or "").strip()
        if fn and ln:
            parts = [data.get("title"), fn, (data.get("middle_name") or "").strip() or None, ln]
            data["full_name"] = " ".join(p for p in parts if p)
    return data


def _apply_contractor_fields(
    db: Session,
    company_id: int,
    data: dict[str, Any],
) -> tuple[Any, Any, Any]:
    cid = data.pop("contractor_id", None)
    main_id = data.pop("main_contractor_id", None)
    sub_id = data.pop("sub_contractor_id", None)
    if cid is not None:
        if main_id is not None or sub_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Use either directory contractor (contractor_id) or legacy main/sub fields, not both.",
            )
        contractor_scope.resolve_directory_contractor_link(db, company_id, cid)
        return cid, None, None
    next_main, next_sub = contractor_scope.apply_guard_contractors(db, company_id, main_id, sub_id)
    return None, next_main, next_sub


def create_guard(db: Session, guard: GuardCreate, user_id: int) -> Guard:
    company = get_company_by_user_id(db, user_id)
    enforce_guard_quota(db, company)
    data = _payload(guard)
    next_cid, next_main, next_sub = _apply_contractor_fields(db, company.id, data)
    if data.get("badge_number") and db.query(Guard).filter(Guard.badge_number == data["badge_number"]).first():
        raise HTTPException(status_code=400, detail="Badge number already exists")
    db_guard = Guard(
        **data,
        company_id=company.id,
        contractor_id=next_cid,
        main_contractor_id=next_main,
        sub_contractor_id=next_sub,
    )
    db.add(db_guard)
    db.flush()
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="create",
        entity_type="guard",
        entity_id=db_guard.id,
        meta={"full_name": data.get("full_name")},
    )
    if getattr(guard, "create_login", False):
        _create_staff_login(db, db_guard, company.id, guard)
    db.commit()
    db.refresh(db_guard)
    return db_guard


def _create_staff_login(db: Session, db_guard: Guard, company_id: int, data: GuardCreate) -> None:
    """Create the Staff-role portal user for a freshly inserted guard.

    Every validation below (and inside create_company_user: quota, duplicate email, role
    checks) raises before that function commits, so a rejected login leaves the flushed
    guard row uncommitted and the request rolls back both together — no orphan guard.
    """
    from app.schemas import CompanyUserCreate
    from app.services import role_service, user_service

    email = (data.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required to create a portal login")
    if not data.login_password:
        raise HTTPException(status_code=400, detail="Password is required to create a portal login")

    role = role_service.get_role_by_slug(db, company_id, "staff")
    if not role:
        role_service.ensure_roles_for_company(db, company_id)
        role = role_service.get_role_by_slug(db, company_id, "staff")
    if not role:
        raise HTTPException(status_code=500, detail="Staff role is not configured for this company")

    user_service.create_company_user(
        db,
        company_id,
        CompanyUserCreate(
            email=email,
            password=data.login_password,
            full_name=(db_guard.full_name or "").strip() or email,
            role_id=role.id,
            guard_id=db_guard.id,
        ),
    )


def get_guards(
    db: Session,
    user_id: int,
    *,
    area: Optional[str] = None,
    postcode: Optional[str] = None,
    nearby: Optional[str] = None,
) -> List[Guard]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(Guard).filter(Guard.company_id == company.id)
    if area and area.strip():
        pat = f"%{area.strip()}%"
        q = q.filter(or_(Guard.service_area.ilike(pat), Guard.town_city.ilike(pat), Guard.postcode.ilike(pat)))
    if postcode and postcode.strip():
        q = q.filter(Guard.postcode.ilike(f"%{postcode.strip()}%"))
    if nearby and nearby.strip():
        pat = f"%{nearby.strip()}%"
        q = q.filter(
            or_(
                Guard.nearby_areas.ilike(pat),
                Guard.service_area.ilike(pat),
                Guard.postcode.ilike(pat),
                Guard.town_city.ilike(pat),
            )
        )
    return q.order_by(Guard.full_name).all()


def get_guard_by_id(db: Session, guard_id: int, user_id: int) -> Guard:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    return guard


def update_guard(db: Session, guard_id: int, guard: GuardCreate, user_id: int) -> Guard:
    company = get_company_by_user_id(db, user_id)
    db_guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not db_guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    touched = guard.model_dump(exclude_unset=True) if hasattr(guard, "model_dump") else {}
    data = _payload(guard, only_set=True)
    if any(k in touched for k in ("contractor_id", "main_contractor_id", "sub_contractor_id")):
        next_cid, next_main, next_sub = _apply_contractor_fields(db, company.id, data)
        db_guard.contractor_id = next_cid
        db_guard.main_contractor_id = next_main
        db_guard.sub_contractor_id = next_sub
    else:
        for k in ("contractor_id", "main_contractor_id", "sub_contractor_id"):
            data.pop(k, None)
    if data.get("badge_number") and data["badge_number"] != db_guard.badge_number:
        if db.query(Guard).filter(Guard.badge_number == data["badge_number"]).first():
            raise HTTPException(status_code=400, detail="Badge number already exists")
    for key, value in data.items():
        setattr(db_guard, key, value)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="update",
        entity_type="guard",
        entity_id=guard_id,
    )
    db.commit()
    db.refresh(db_guard)
    return db_guard


def delete_guard(db: Session, guard_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="delete",
        entity_type="guard",
        entity_id=guard_id,
    )
    db.delete(guard)
    db.commit()
