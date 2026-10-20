from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.auth import SUPER_ADMIN_ROLE, get_password_hash
from app.models import User, Role, Company, Guard, Client, Site, UserSite, UserCompanyMembership
from app.schemas import CompanyUserCreate, CompanyUserUpdate
from app.services.plan_enforcement import enforce_user_quota
from app.services import membership_service


def _get_user(db: Session, company_id: int, user_id: int) -> User:
    u = db.query(User).filter(User.id == user_id).first()
    if not u or not membership_service.belongs_to_company(db, u, company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return u


def _validate_site_ids(
    db: Session, company_id: int, site_ids: List[int], client_id: Optional[int]
) -> List[int]:
    """Resolve requested pins to a validated, deduplicated list.

    A pin may only ever narrow what a login can already reach, so every site has to
    belong to the company and — for a Client-role login — to that user's own client.
    Without the second check a pin would become a way to grant a client access to a
    different client's site.
    """
    ids = list(dict.fromkeys(site_ids))
    if not ids:
        return []
    q = db.query(Site.id).filter(Site.company_id == company_id, Site.id.in_(ids))
    if client_id is not None:
        q = q.filter(Site.client_id == client_id)
    found = {r[0] for r in q.all()}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Site(s) not found for this client: {', '.join(str(i) for i in missing)}",
        )
    return ids


def _set_site_pins(
    db: Session, user: User, company_id: int, site_ids: List[int], client_id: Optional[int]
) -> None:
    """Replace this user's pin rows. Caller commits."""
    validated = _validate_site_ids(db, company_id, site_ids, client_id)
    db.query(UserSite).filter(
        UserSite.user_id == user.id, UserSite.company_id == company_id
    ).delete(synchronize_session=False)
    for sid in validated:
        db.add(UserSite(user_id=user.id, site_id=sid, company_id=company_id))


def _validate_role_scope(
    db: Session, company_id: int, role: Role, data: CompanyUserCreate
) -> tuple[Optional[int], Optional[int]]:
    client_id = data.client_id
    guard_id = data.guard_id
    if role.slug == "super_admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    if role.slug == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only one Admin is allowed. Assign a custom role instead.",
        )
    if role.slug == "client":
        if not client_id and not data.site_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="client_id or site_ids is required for Client role",
            )
        if client_id:
            client = db.query(Client).filter(Client.id == client_id, Client.company_id == company_id).first()
            if not client:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        guard_id = None
    elif role.slug == "staff":
        if not guard_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="guard_id is required for Staff role")
        guard = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
        if not guard:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff profile not found")
        client_id = None
    else:
        if client_id and not db.query(Client).filter(Client.id == client_id, Client.company_id == company_id).first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        if guard_id and not db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff profile not found")
    return client_id, guard_id


def create_company_user(db: Session, company_id: int, data: CompanyUserCreate) -> User:
    from app.services.email_uniqueness import assert_email_available, find_user_by_email, normalize_email

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    enforce_user_quota(db, company)
    email = normalize_email(data.email)
    role = db.query(Role).filter(Role.id == data.role_id, Role.company_id == company_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    client_id, guard_id = _validate_role_scope(db, company_id, role, data)

    existing = find_user_by_email(db, email)
    if existing:
        if getattr(existing, "role", None) == SUPER_ADMIN_ROLE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email address is already registered. Please use a different email.",
            )
        if membership_service.belongs_to_company(db, existing, company_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This person already has a login for this company.",
            )
        membership_service.upsert_membership(
            db,
            user=existing,
            company_id=company_id,
            role=role,
            guard_id=guard_id,
            client_id=client_id,
            make_active_context=not existing.company_id,
        )
        if data.site_ids:
            _set_site_pins(db, existing, company_id, data.site_ids, client_id)
        db.commit()
        db.refresh(existing)
        return existing

    email = assert_email_available(db, data.email)
    user = User(
        email=email,
        password_hash=get_password_hash(data.password),
        full_name=data.full_name.strip(),
        role=role.slug,
        role_id=role.id,
        company_id=company_id,
        client_id=client_id,
        guard_id=guard_id,
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.flush()
    membership_service.upsert_membership(
        db,
        user=user,
        company_id=company_id,
        role=role,
        guard_id=guard_id,
        client_id=client_id,
        make_active_context=True,
    )
    if data.site_ids:
        _set_site_pins(db, user, company_id, data.site_ids, client_id)
    db.commit()
    db.refresh(user)
    return user


def update_company_user(db: Session, company_id: int, user_id: int, data: CompanyUserUpdate) -> User:
    from app.services.email_uniqueness import assert_email_available

    user = _get_user(db, company_id, user_id)
    if data.email is not None:
        user.email = assert_email_available(db, data.email, exclude_user_id=user_id)
    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.password:
        user.password_hash = get_password_hash(data.password)
    membership = membership_service.get_membership(db, user.id, company_id, active_only=False)
    active_here = user.company_id == company_id
    next_role_id = membership.role_id if membership else (user.role_id if active_here else None)
    next_guard_id = membership.guard_id if membership else (user.guard_id if active_here else None)
    next_client_id = membership.client_id if membership else (user.client_id if active_here else None)
    current_role = None
    if next_role_id:
        current_role = db.query(Role).filter(Role.id == next_role_id).first()
    if data.role_id is not None:
        if current_role and current_role.slug == "admin" and data.role_id != next_role_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin role cannot be changed",
            )
        role = db.query(Role).filter(Role.id == data.role_id, Role.company_id == company_id).first()
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        if role.slug == "admin" and (not current_role or current_role.slug != "admin"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only one Admin is allowed. Assign a custom role instead.",
            )
        next_role_id = role.id
        current_role = role
        if role.slug == "client":
            next_guard_id = None
        elif role.slug == "staff":
            next_client_id = None
    if data.client_id is not None:
        if data.client_id:
            if not db.query(Client).filter(Client.id == data.client_id, Client.company_id == company_id).first():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        next_client_id = data.client_id
    if data.guard_id is not None:
        if data.guard_id:
            if not db.query(Guard).filter(Guard.id == data.guard_id, Guard.company_id == company_id).first():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff profile not found")
        next_guard_id = data.guard_id
    if data.site_ids is not None:
        _set_site_pins(db, user, company_id, data.site_ids, next_client_id)
    if current_role is None and next_role_id:
        current_role = db.query(Role).filter(Role.id == next_role_id).first()
    if current_role:
        membership_service.upsert_membership(
            db,
            user=user,
            company_id=company_id,
            role=current_role,
            guard_id=next_guard_id,
            client_id=next_client_id,
            make_active_context=active_here,
        )
    db.commit()
    db.refresh(user)
    return user


def reset_company_user_password(db: Session, company_id: int, user_id: int, new_password: str) -> User:
    from app.services import login_guard_service, session_service

    user = _get_user(db, company_id, user_id)
    user.password_hash = get_password_hash(new_password)
    login_guard_service.clear_lockout_state(user)
    db.commit()
    db.refresh(user)
    session_service.revoke_all_for_user(db, user.id)
    return user


def delete_company_user(db: Session, company_id: int, user_id: int, actor_id: int) -> None:
    if user_id == actor_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    user = _get_user(db, company_id, user_id)
    if company.admin_id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the company owner account")
    membership_service.remove_membership(db, user, company_id)
    still_member = (
        db.query(UserCompanyMembership)
        .filter(UserCompanyMembership.user_id == user.id, UserCompanyMembership.is_active.is_(True))
        .first()
    )
    if still_member is None and user.company_id is None:
        db.delete(user)
    db.commit()
