from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.models import User, Role, Company, Guard, Client, Site, UserSite
from app.schemas import CompanyUserCreate, CompanyUserUpdate
from app.services.plan_enforcement import enforce_user_quota


def _get_user(db: Session, company_id: int, user_id: int) -> User:
    u = db.query(User).filter(User.id == user_id, User.company_id == company_id).first()
    if not u:
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
    db.query(UserSite).filter(UserSite.user_id == user.id).delete(synchronize_session=False)
    for sid in validated:
        db.add(UserSite(user_id=user.id, site_id=sid, company_id=company_id))


def create_company_user(db: Session, company_id: int, data: CompanyUserCreate) -> User:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    enforce_user_quota(db, company)
    email = data.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    role = db.query(Role).filter(Role.id == data.role_id, Role.company_id == company_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if role.slug == "super_admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    if role.slug == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only one Admin is allowed. Assign a custom role instead.",
        )
    client_id = data.client_id
    guard_id = data.guard_id
    if role.slug == "client":
        # A Client login is scoped either by its client (all that client's sites) or by
        # an explicit site list (a site-only login, independent of any client). One of
        # the two is required: with neither, the login would be scoped to nothing.
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
    if data.site_ids:
        # flush so user.id exists for the pin rows, but stay in the same transaction:
        # a rejected pin must roll the new user back with it.
        db.flush()
        _set_site_pins(db, user, company_id, data.site_ids, client_id)
    db.commit()
    db.refresh(user)
    return user


def update_company_user(db: Session, company_id: int, user_id: int, data: CompanyUserUpdate) -> User:
    user = _get_user(db, company_id, user_id)
    if data.email is not None:
        email = data.email.lower().strip()
        clash = db.query(User).filter(func.lower(User.email) == email, User.id != user_id).first()
        if clash:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        user.email = email
    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.password:
        user.password_hash = get_password_hash(data.password)
    if data.role_id is not None:
        if user.role_row and user.role_row.slug == "admin" and data.role_id != user.role_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin role cannot be changed",
            )
        role = db.query(Role).filter(Role.id == data.role_id, Role.company_id == company_id).first()
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        if role.slug == "admin" and (not user.role_row or user.role_row.slug != "admin"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only one Admin is allowed. Assign a custom role instead.",
            )
        user.role_id = role.id
        user.role = role.slug
        if role.slug == "client":
            user.guard_id = None
        elif role.slug == "staff":
            user.client_id = None
    if data.client_id is not None:
        if data.client_id:
            if not db.query(Client).filter(Client.id == data.client_id, Client.company_id == company_id).first():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        user.client_id = data.client_id
    if data.guard_id is not None:
        if data.guard_id:
            if not db.query(Guard).filter(Guard.id == data.guard_id, Guard.company_id == company_id).first():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff profile not found")
        user.guard_id = data.guard_id
    if data.site_ids is not None:
        # [] clears the pins, restoring client-wide access; None leaves them untouched.
        _set_site_pins(db, user, company_id, data.site_ids, user.client_id)
    db.commit()
    db.refresh(user)
    return user


def reset_company_user_password(db: Session, company_id: int, user_id: int, new_password: str) -> User:
    user = _get_user(db, company_id, user_id)
    user.password_hash = get_password_hash(new_password)
    db.commit()
    db.refresh(user)
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
    db.delete(user)
    db.commit()
