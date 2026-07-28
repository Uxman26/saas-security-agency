from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Assignment, Guard, Site, User


def role_slug(user: User) -> str:
    if user.role_row and user.role_row.slug:
        return user.role_row.slug.lower().strip()
    return (user.role or "").lower().strip()


def is_portal_role(user: User) -> bool:
    return role_slug(user) in {"client", "staff"}


def is_client_portal_user(user: User) -> bool:
    return role_slug(user) == "client"


def is_staff_portal_user(user: User) -> bool:
    return role_slug(user) == "staff"


def get_linked_guard(db: Session, user: User) -> Optional[Guard]:
    if not user.company_id:
        return None
    if user.guard_id:
        g = (
            db.query(Guard)
            .filter(Guard.id == user.guard_id, Guard.company_id == user.company_id)
            .first()
        )
        if g:
            return g
    email = (user.email or "").lower().strip()
    if not email:
        return None
    return (
        db.query(Guard)
        .filter(Guard.company_id == user.company_id, func.lower(Guard.email) == email)
        .first()
    )


def client_site_ids(db: Session, user: User) -> Optional[set[int]]:
    if not user.client_id:
        return set()
    rows = (
        db.query(Site.id)
        .filter(Site.company_id == user.company_id, Site.client_id == user.client_id)
        .all()
    )
    return {r[0] for r in rows}


def staff_site_ids(db: Session, user: User) -> set[int]:
    guard = get_linked_guard(db, user)
    if not guard:
        return set()
    rows = (
        db.query(Assignment.site_id)
        .filter(Assignment.guard_id == guard.id)
        .distinct()
        .all()
    )
    return {r[0] for r in rows}


def filter_sites_for_user(db: Session, user: User, q):
    slug = role_slug(user)
    if slug == "client" and user.client_id:
        return q.filter(Site.client_id == user.client_id)
    if slug == "staff":
        ids = staff_site_ids(db, user)
        if not ids:
            return q.filter(Site.id < 0)
        return q.filter(Site.id.in_(ids))
    return q


def filter_assignments_for_user(db: Session, user: User, q):
    slug = role_slug(user)
    if slug == "client" and user.client_id:
        return q.filter(Site.client_id == user.client_id)
    if slug == "staff":
        guard = get_linked_guard(db, user)
        if not guard:
            return q.filter(Assignment.guard_id < 0)
        return q.filter(Assignment.guard_id == guard.id)
    return q
