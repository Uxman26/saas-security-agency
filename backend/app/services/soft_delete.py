"""Archive / restore / permanently delete, shared by Sites, Clients and Staff.

Two different deletes, deliberately kept apart:

**Archive** (soft delete) stamps ``deleted_at`` and leaves everything else alone. The
row disappears from every list, picker and filter, but nothing that already points at it
changes — a past shift still names the staff member who worked it, an invoice still names
the client it was raised for, and payroll still adds up. This is the one to reach for
when someone leaves or a contract ends, and it is reversible.

**Permanent delete** removes the row and everything the ORM cascades from it. That is
not reversible and it rewrites history, so callers must say so explicitly and the UI
asks the operator to confirm they understand.

Archiving does not check for references — that is the whole point of it — while
permanent deletion keeps whatever blockers each resource already enforced.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

# What a list endpoint may ask for. "active" is the default everywhere, so a caller that
# knows nothing about archiving keeps seeing exactly what it saw before.
VIEW_ACTIVE = "active"
VIEW_ARCHIVED = "archived"
VIEW_ALL = "all"
VIEWS = (VIEW_ACTIVE, VIEW_ARCHIVED, VIEW_ALL)


def normalize_view(view: Optional[str]) -> str:
    v = (view or VIEW_ACTIVE).strip().lower()
    if v not in VIEWS:
        raise HTTPException(
            status_code=400, detail=f"view must be one of {', '.join(VIEWS)}"
        )
    return v


def apply_view(query, model, view: Optional[str] = VIEW_ACTIVE):
    """Narrow a query to active rows, archived rows, or leave it open."""
    v = normalize_view(view)
    if v == VIEW_ACTIVE:
        return query.filter(model.deleted_at.is_(None))
    if v == VIEW_ARCHIVED:
        return query.filter(model.deleted_at.isnot(None))
    return query


def active_only(query, model):
    """The default for every read that is not explicitly about archived rows."""
    return query.filter(model.deleted_at.is_(None))


def is_archived(row) -> bool:
    return getattr(row, "deleted_at", None) is not None


def mark_archived(row, user_id: int) -> None:
    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by_user_id = user_id


def mark_restored(row) -> None:
    row.deleted_at = None
    row.deleted_by_user_id = None


def deleted_by_name(db: Session, row) -> Optional[str]:
    """Who archived it, for the Archived list. Falls back to None rather than failing."""
    uid = getattr(row, "deleted_by_user_id", None)
    if not uid:
        return None
    from app.models import User

    user = db.query(User).filter(User.id == uid).first()
    return user.full_name if user else None
