"""Shared shape for the portal logins listed on the client and site edit screens."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import User, UserSite
from app.schemas import PortalLoginOut


def portal_login_out(db: Session, user: User) -> PortalLoginOut:
    pins = [row[0] for row in db.query(UserSite.site_id).filter(UserSite.user_id == user.id).all()]
    role_row = getattr(user, "role_row", None)
    return PortalLoginOut(
        id=user.id,
        email=user.email or "",
        full_name=user.full_name or "",
        role_name=(getattr(role_row, "name", "") or user.role or ""),
        is_active=bool(user.is_active),
        site_ids=sorted(pins),
    )
