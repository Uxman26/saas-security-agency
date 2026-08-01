"""Shared resource-level authorization.

Tenant isolation in this codebase is per-query: a handler resolves the caller's
company and filters on ``company_id``. That works, but it is a convention, so every
new query is one forgotten filter away from a cross-tenant leak. The helpers here
make the safe version the short version.

Use ``owned_or_404`` to load a record by id, and ``assert_owned`` to validate a
foreign key that arrived in a request body. Both raise **404** rather than 403 on a
miss, so a caller cannot use the status code to learn whether an id exists in
another tenant.
"""

from __future__ import annotations

from typing import Any, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth import SUPER_ADMIN_ROLE
from app.models import User

T = TypeVar("T")


def _caller_company_id(db: Session, user: User) -> int | None:
    """The company the caller acts within, or None for a platform super admin."""
    if getattr(user, "role", None) == SUPER_ADMIN_ROLE:
        return None
    if user.company_id:
        return user.company_id
    from app.services.company_service import get_company_by_user_id

    return get_company_by_user_id(db, user.id).id


def owned_or_404(
    db: Session,
    model: type[T],
    resource_id: Any,
    user: User,
    *,
    company_field: str = "company_id",
    detail: str = "Not found",
) -> T:
    """Load ``model`` by primary key, but only if it belongs to the caller's company.

    A super admin is not company-scoped and may load any row. For every other user a
    row from another tenant is indistinguishable from one that does not exist.
    """
    if resource_id is None:
        raise HTTPException(status_code=404, detail=detail)

    company_id = _caller_company_id(db, user)
    q = db.query(model).filter(model.id == resource_id)
    if company_id is not None:
        q = q.filter(getattr(model, company_field) == company_id)

    obj = q.first()
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj


def assert_owned(
    db: Session,
    model: type[Any],
    resource_id: Any,
    user: User,
    *,
    company_field: str = "company_id",
    field_name: str = "id",
) -> None:
    """Validate a client-supplied foreign key against the caller's company."""
    assert_owned_by_company(
        db,
        model,
        resource_id,
        _caller_company_id(db, user),
        company_field=company_field,
        field_name=field_name,
    )


def assert_owned_by_company(
    db: Session,
    model: type[Any],
    resource_id: Any,
    company_id: int | None,
    *,
    company_field: str = "company_id",
    field_name: str = "id",
) -> None:
    """Validate a client-supplied foreign key before it is persisted.

    Guards against a caller planting another tenant's id in a request body — the row
    is accepted by the database, then the referenced name leaks back out on read.
    ``None`` passes, so optional fields can be handed straight in. Takes the company
    id directly for the many services that have already resolved it.
    """
    if resource_id is None:
        return
    q = db.query(model.id).filter(model.id == resource_id)
    if company_id is not None:
        q = q.filter(getattr(model, company_field) == company_id)
    if q.first() is None:
        raise HTTPException(status_code=422, detail=f"Invalid {field_name}")
