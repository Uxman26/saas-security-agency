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
from app.services import soft_delete


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


def list_guard_portal_logins(db: Session, guard_id: int, user_id: int) -> List["User"]:
    """The portal logins attached to this guard, for the Portal login panel on its edit screen."""
    from app.models import User

    guard = get_guard_by_id(db, guard_id, user_id)
    return (
        db.query(User)
        .filter(User.company_id == guard.company_id, User.guard_id == guard.id)
        .order_by(User.email)
        .all()
    )


def create_guard_portal_login(
    db: Session, guard_id: int, email: Optional[str], password: str, user_id: int
) -> "User":
    """Provision the Staff-role login for an existing guard, from its edit screen.

    Staff who were added without a login previously had no route to one at all; this is
    the same provisioning the create flow runs, just against a guard that already exists.
    """
    from app.schemas import CompanyUserCreate
    from app.services import role_service, user_service

    company = get_company_by_user_id(db, user_id)
    guard = get_guard_by_id(db, guard_id, user_id)
    if list_guard_portal_logins(db, guard_id, user_id):
        raise HTTPException(status_code=400, detail="This staff member already has a portal login")

    login_email = (email or guard.email or "").strip()
    if not login_email:
        raise HTTPException(status_code=400, detail="Email is required to create a portal login")

    role = role_service.get_role_by_slug(db, company.id, "staff")
    if not role:
        role_service.ensure_roles_for_company(db, company.id)
        role = role_service.get_role_by_slug(db, company.id, "staff")
    if not role:
        raise HTTPException(status_code=500, detail="Staff role is not configured for this company")

    return user_service.create_company_user(
        db,
        company.id,
        CompanyUserCreate(
            email=login_email,
            password=password,
            full_name=(guard.full_name or "").strip() or login_email,
            role_id=role.id,
            guard_id=guard.id,
        ),
    )


def set_guard_login_password(
    db: Session, guard_id: int, login_user_id: int, new_password: str, user_id: int
) -> "User":
    """Set a new password on one of this guard's portal logins.

    The login must already belong to this guard. Checking that here — rather than trusting
    the id the screen sends — keeps the staff editor from being able to reach any other
    account in the company, whatever it posts.
    """
    from app.services import user_service

    logins = {u.id for u in list_guard_portal_logins(db, guard_id, user_id)}
    if login_user_id not in logins:
        raise HTTPException(status_code=404, detail="Portal login not found for this staff member")
    company = get_company_by_user_id(db, user_id)
    return user_service.reset_company_user_password(db, company.id, login_user_id, new_password)


def get_guards(
    db: Session,
    user_id: int,
    *,
    area: Optional[str] = None,
    postcode: Optional[str] = None,
    nearby: Optional[str] = None,
    view: str = soft_delete.VIEW_ACTIVE,
) -> List[Guard]:
    """Staff records. Archived people are left out unless ``view`` asks for them."""
    company = get_company_by_user_id(db, user_id)
    q = soft_delete.apply_view(
        db.query(Guard).filter(Guard.company_id == company.id), Guard, view
    )
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


def _assert_not_archived(guard: Guard) -> None:
    """Editing an archived record would quietly bring half of it back to life."""
    if soft_delete.is_archived(guard):
        raise HTTPException(
            status_code=409,
            detail=f"“{guard.full_name}” is archived. Restore them before making changes.",
        )


def update_guard(db: Session, guard_id: int, guard: GuardCreate, user_id: int) -> Guard:
    company = get_company_by_user_id(db, user_id)
    db_guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not db_guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    _assert_not_archived(db_guard)
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


def _guard_for_write(db: Session, guard_id: int, user_id: int) -> tuple[Guard, "Company"]:
    company = get_company_by_user_id(db, user_id)
    guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company.id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")
    return guard, company


def _deactivate_guard_logins(db: Session, guard: Guard) -> int:
    """Archiving someone has to close their way in, or the record is only half gone."""
    from app.models import User

    return (
        db.query(User)
        .filter(User.company_id == guard.company_id, User.guard_id == guard.id, User.is_active.is_(True))
        .update({User.is_active: False}, synchronize_session=False)
    )


def archive_guard(db: Session, guard_id: int, user_id: int) -> Guard:
    """Soft delete: the person leaves the Staff list, their history stays intact.

    Their shifts, payroll and documents are untouched, so every past record still reads
    correctly. Any portal login they hold is switched off — restoring the record does not
    switch it back on, which is deliberate: re-granting access should be a decision, not
    a side effect.
    """
    guard, company = _guard_for_write(db, guard_id, user_id)
    if soft_delete.is_archived(guard):
        return guard
    logins = _deactivate_guard_logins(db, guard)
    soft_delete.mark_archived(guard, user_id)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="archive",
        entity_type="guard",
        entity_id=guard_id,
        meta={"name": guard.full_name, "logins_disabled": logins},
    )
    db.commit()
    db.refresh(guard)
    return guard


def restore_guard(db: Session, guard_id: int, user_id: int) -> Guard:
    """Bring an archived staff member back to the Staff list. Logins stay disabled."""
    guard, company = _guard_for_write(db, guard_id, user_id)
    if not soft_delete.is_archived(guard):
        return guard
    soft_delete.mark_restored(guard)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="restore",
        entity_type="guard",
        entity_id=guard_id,
        meta={"name": guard.full_name},
    )
    db.commit()
    db.refresh(guard)
    return guard


def guard_delete_impact(db: Session, guard_id: int, user_id: int) -> dict:
    """What a permanent delete would destroy, so the confirmation can say it out loud."""
    from app.models import Assignment, Attendance, GuardDocument, GuardRate, Payroll, User

    guard, _company = _guard_for_write(db, guard_id, user_id)
    counts = {
        "shifts": db.query(Assignment).filter(Assignment.guard_id == guard.id).count(),
        "attendance records": db.query(Attendance).filter(Attendance.guard_id == guard.id).count(),
        "payroll records": db.query(Payroll).filter(Payroll.guard_id == guard.id).count(),
        "documents": db.query(GuardDocument).filter(GuardDocument.guard_id == guard.id).count(),
        "pay rates": db.query(GuardRate).filter(GuardRate.guard_id == guard.id).count(),
        "portal logins": db.query(User).filter(User.guard_id == guard.id).count(),
    }
    return {
        "id": guard.id,
        "name": guard.full_name,
        "archived": soft_delete.is_archived(guard),
        "records": [{"label": k, "count": v} for k, v in counts.items() if v],
        "blockers": [],
    }


def delete_guard(db: Session, guard_id: int, user_id: int) -> None:
    """Permanent delete: the record and everything cascading from it, irreversibly.

    Portal logins are unpinned rather than deleted — a login is a company account that
    may have its own audit trail, so it is left for the Users screen to remove.
    """
    from app.models import User

    guard, company = _guard_for_write(db, guard_id, user_id)
    impact = guard_delete_impact(db, guard_id, user_id)
    db.query(User).filter(User.guard_id == guard.id).update(
        {User.guard_id: None, User.is_active: False}, synchronize_session=False
    )
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="delete",
        entity_type="guard",
        entity_id=guard_id,
        meta={"name": guard.full_name, "destroyed": impact["records"]},
    )
    db.delete(guard)
    db.commit()
