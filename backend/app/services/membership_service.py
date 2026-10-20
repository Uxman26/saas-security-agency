"""Per-tenant assignments for a single login identity.

``User.email`` is globally unique. Employment in a company is a membership row.
``User.company_id`` / ``role`` / ``guard_id`` / ``client_id`` are the *active*
tenant context used by existing queries — never mix two companies in one request.
"""

from __future__ import annotations

from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.auth import SUPER_ADMIN_ROLE
from app.models import Company, Role, User, UserCompanyMembership


def get_membership(
    db: Session, user_id: int, company_id: int, *, active_only: bool = True
) -> UserCompanyMembership | None:
    q = db.query(UserCompanyMembership).filter(
        UserCompanyMembership.user_id == user_id,
        UserCompanyMembership.company_id == company_id,
    )
    if active_only:
        q = q.filter(UserCompanyMembership.is_active.is_(True))
    return q.first()


def user_ids_in_company(db: Session, company_id: int) -> set[int]:
    ids = {
        r[0]
        for r in db.query(UserCompanyMembership.user_id)
        .filter(
            UserCompanyMembership.company_id == company_id,
            UserCompanyMembership.is_active.is_(True),
        )
        .all()
    }
    ids |= {
        r[0]
        for r in db.query(User.id).filter(User.company_id == company_id).all()
        if r[0]
    }
    return ids


def user_ids_for_guard(db: Session, company_id: int, guard_id: int) -> set[int]:
    ids = {
        r[0]
        for r in db.query(UserCompanyMembership.user_id)
        .filter(
            UserCompanyMembership.company_id == company_id,
            UserCompanyMembership.guard_id == guard_id,
            UserCompanyMembership.is_active.is_(True),
        )
        .all()
    }
    ids |= {
        r[0]
        for r in db.query(User.id)
        .filter(User.company_id == company_id, User.guard_id == guard_id)
        .all()
        if r[0]
    }
    return ids


def users_in_company(db: Session, company_id: int) -> list[User]:
    ids = user_ids_in_company(db, company_id)
    if not ids:
        return []
    return db.query(User).filter(User.id.in_(ids)).order_by(User.email).all()


def count_active_company_users(db: Session, company_id: int) -> int:
    ids = user_ids_in_company(db, company_id)
    if not ids:
        return 0
    return (
        db.query(User)
        .filter(User.id.in_(ids), User.is_active.is_(True))
        .count()
    )


def belongs_to_company(db: Session, user: User, company_id: int) -> bool:
    if not company_id:
        return False
    if user.company_id == company_id:
        return True
    return get_membership(db, user.id, company_id) is not None


def apply_membership_to_user(user: User, membership: UserCompanyMembership, role: Role | None = None) -> None:
    """Copy this tenant assignment onto the denormalised User columns (active context)."""
    user.company_id = membership.company_id
    user.role_id = membership.role_id
    user.guard_id = membership.guard_id
    user.client_id = membership.client_id
    slug = (role.slug if role is not None else None) or membership.role
    if slug:
        user.role = slug


def upsert_membership(
    db: Session,
    *,
    user: User,
    company_id: int,
    role: Role,
    guard_id: Optional[int],
    client_id: Optional[int],
    make_active_context: bool = False,
) -> UserCompanyMembership:
    row = get_membership(db, user.id, company_id, active_only=False)
    if row is None:
        row = UserCompanyMembership(
            user_id=user.id,
            company_id=company_id,
            role_id=role.id,
            role=role.slug,
            guard_id=guard_id,
            client_id=client_id,
            is_active=True,
        )
        db.add(row)
        db.flush()
    else:
        row.role_id = role.id
        row.role = role.slug
        row.guard_id = guard_id
        row.client_id = client_id
        row.is_active = True
    if make_active_context or not user.company_id:
        apply_membership_to_user(user, row, role)
    elif user.company_id == company_id:
        apply_membership_to_user(user, row, role)
    return row


def list_company_options(db: Session, user: User) -> list[dict]:
    if getattr(user, "role", None) == SUPER_ADMIN_ROLE:
        return []
    rows = (
        db.query(UserCompanyMembership, Company, Role)
        .join(Company, Company.id == UserCompanyMembership.company_id)
        .outerjoin(Role, Role.id == UserCompanyMembership.role_id)
        .filter(
            UserCompanyMembership.user_id == user.id,
            UserCompanyMembership.is_active.is_(True),
        )
        .order_by(Company.name)
        .all()
    )
    seen: set[int] = set()
    out: list[dict] = []
    for membership, company, role in rows:
        seen.add(company.id)
        slug = (role.slug if role is not None else None) or membership.role
        out.append(
            {
                "company_id": company.id,
                "login_id": getattr(company, "login_id", None),
                "company_name": company.name,
                "role": slug,
                "role_id": membership.role_id,
                "guard_id": membership.guard_id,
                "client_id": membership.client_id,
                "is_current": user.company_id == company.id,
            }
        )
    if user.company_id and user.company_id not in seen:
        co = db.query(Company).filter(Company.id == user.company_id).first()
        if co:
            out.insert(
                0,
                {
                    "company_id": co.id,
                    "login_id": getattr(co, "login_id", None),
                    "company_name": co.name,
                    "role": user.role,
                    "role_id": user.role_id,
                    "guard_id": user.guard_id,
                    "client_id": user.client_id,
                    "is_current": True,
                },
            )
    return out


def switch_company(db: Session, user: User, company_id: int) -> User:
    if getattr(user, "role", None) == SUPER_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Platform administrators are not assigned to a tenant.",
        )
    membership = get_membership(db, user.id, company_id)
    role = None
    if membership is None:
        if user.company_id != company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of that company.",
            )
        role = db.query(Role).filter(Role.id == user.role_id).first() if user.role_id else None
        if role:
            membership = upsert_membership(
                db,
                user=user,
                company_id=company_id,
                role=role,
                guard_id=user.guard_id,
                client_id=user.client_id,
                make_active_context=True,
            )
        else:
            user.company_id = company_id
            db.commit()
            db.refresh(user)
            return user
    else:
        role = db.query(Role).filter(Role.id == membership.role_id).first() if membership.role_id else None
    apply_membership_to_user(user, membership, role)
    db.commit()
    db.refresh(user)
    return user


def remove_membership(db: Session, user: User, company_id: int) -> None:
    row = get_membership(db, user.id, company_id, active_only=False)
    if row is not None:
        db.delete(row)
        db.flush()
    remaining = (
        db.query(UserCompanyMembership)
        .filter(
            UserCompanyMembership.user_id == user.id,
            UserCompanyMembership.is_active.is_(True),
        )
        .order_by(UserCompanyMembership.id)
        .all()
    )
    if user.company_id == company_id:
        if remaining:
            role = db.query(Role).filter(Role.id == remaining[0].role_id).first()
            apply_membership_to_user(user, remaining[0], role)
        else:
            user.company_id = None
            user.role_id = None
            user.guard_id = None
            user.client_id = None


def ensure_memberships_table(db: Session) -> None:
    """Idempotent backfill of memberships from users.company_id."""
    users: Iterable[User] = db.query(User).filter(User.company_id.isnot(None)).all()
    for user in users:
        if get_membership(db, user.id, user.company_id, active_only=False):
            continue
        db.add(
            UserCompanyMembership(
                user_id=user.id,
                company_id=user.company_id,
                role_id=user.role_id,
                role=user.role,
                guard_id=user.guard_id,
                client_id=user.client_id,
                is_active=True,
            )
        )
    db.commit()
