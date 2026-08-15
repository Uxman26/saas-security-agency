from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Assignment, Guard, Site, User, UserSite


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


def pinned_site_ids(db: Session, user: User) -> Optional[set[int]]:
    """Sites this login was explicitly restricted to, or None when it has no pins.

    None and the empty set mean different things and must not be collapsed: None is
    "never pinned", which keeps the pre-existing client-wide scope, while a pin row set
    that resolves to nothing would mean "pinned to no sites". Rows are only ever written
    for sites belonging to the user's own client, so pins narrow and never widen.
    """
    rows = (
        db.query(UserSite.site_id)
        .filter(UserSite.user_id == user.id, UserSite.company_id == user.company_id)
        .all()
    )
    if not rows:
        return None
    return {r[0] for r in rows}


def client_site_ids(db: Session, user: User) -> Optional[set[int]]:
    if not user.client_id:
        return set()
    rows = (
        db.query(Site.id)
        .filter(Site.company_id == user.company_id, Site.client_id == user.client_id)
        .all()
    )
    ids = {r[0] for r in rows}
    pinned = pinned_site_ids(db, user)
    if pinned is not None:
        return ids & pinned
    return ids


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
    ids = {r[0] for r in rows}
    pinned = pinned_site_ids(db, user)
    if pinned is not None:
        return ids & pinned
    return ids


def filter_sites_for_user(db: Session, user: User, q):
    slug = role_slug(user)
    if slug == "client":
        pinned = pinned_site_ids(db, user)
        if pinned is not None:
            if user.client_id:
                # Keep the client predicate too: a pin that outlived a site being
                # reassigned to another client must not keep granting access to it.
                return q.filter(Site.client_id == user.client_id, Site.id.in_(pinned))
            # Site-only login, deliberately not attached to any client.
            return q.filter(Site.id.in_(pinned))
        if user.client_id:
            return q.filter(Site.client_id == user.client_id)
        # No client and no pins: this login has been granted nothing, so it sees
        # nothing. Falling through to an unfiltered query here would show it every
        # site in the company.
        return q.filter(Site.id < 0)
    if slug == "staff":
        ids = staff_site_ids(db, user)
        if not ids:
            return q.filter(Site.id < 0)
        return q.filter(Site.id.in_(ids))
    return q


def filter_assignments_for_user(db: Session, user: User, q):
    slug = role_slug(user)
    if slug == "client":
        pinned = pinned_site_ids(db, user)
        if pinned is not None:
            if user.client_id:
                return q.filter(Site.client_id == user.client_id, Site.id.in_(pinned))
            return q.filter(Site.id.in_(pinned))
        if user.client_id:
            return q.filter(Site.client_id == user.client_id)
        # Fail closed, exactly as filter_sites_for_user does.
        return q.filter(Site.id < 0)
    if slug == "staff":
        guard = get_linked_guard(db, user)
        if not guard:
            return q.filter(Assignment.guard_id < 0)
        pinned = pinned_site_ids(db, user)
        if pinned is not None:
            return q.filter(Assignment.guard_id == guard.id, Assignment.site_id.in_(pinned))
        return q.filter(Assignment.guard_id == guard.id)
    return q


def assert_site_visible(db: Session, user: User, site_id: int) -> int:
    """Validate a caller-supplied site_id against what this login may actually see.

    404 rather than 403 so a probe cannot distinguish "exists but not yours" from
    "does not exist", matching authz.owned_or_404.
    """
    from fastapi import HTTPException

    allowed = filter_sites_for_user(
        db, user, db.query(Site.id).filter(Site.company_id == user.company_id, Site.id == site_id)
    ).first()
    if not allowed:
        raise HTTPException(status_code=404, detail="Site not found")
    return site_id
