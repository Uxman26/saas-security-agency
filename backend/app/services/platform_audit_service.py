"""Audit trail for super-admin actions.

Separate from ``audit_service`` on purpose: that one is tenant-scoped and its rows go
away with the tenant. These rows have to survive the thing they describe — the record of
who deleted a company is worth nothing if it is deleted along with the company.

Unlike ``audit_service.log_action``, ``log`` here commits by default. Most callers are
recording an action that has already happened (a purge, an impersonation) and must not
lose the record if a later step in the request fails. Pass ``commit=False`` to enlist in
the caller's transaction instead.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import Company, PlatformAuditLog, User


def _json(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return json.dumps(value, default=str)
    except (TypeError, ValueError):
        return json.dumps({"unserializable": repr(value)})


def request_meta(request: Optional[Request]) -> tuple[Optional[str], Optional[str]]:
    """Client IP and user agent, tolerant of being called without a request."""
    if request is None:
        return None, None
    ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else None)
    if ip:
        # X-Forwarded-For is a list; the client is the first entry.
        ip = ip.split(",")[0].strip()
    return ip, (request.headers.get("user-agent") or None)


def log(
    db: Session,
    *,
    actor: Optional[User],
    action: str,
    target_type: str,
    target_id: Optional[int] = None,
    target_label: Optional[str] = None,
    company: Optional[Company] = None,
    company_id: Optional[int] = None,
    company_name: Optional[str] = None,
    before: Any = None,
    after: Any = None,
    note: Optional[str] = None,
    request: Optional[Request] = None,
    commit: bool = True,
) -> PlatformAuditLog:
    ip, ua = request_meta(request)
    row = PlatformAuditLog(
        actor_user_id=getattr(actor, "id", None),
        actor_email=getattr(actor, "email", None),
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_label=target_label,
        company_id=company.id if company is not None else company_id,
        company_name=company.name if company is not None else company_name,
        before_json=_json(before),
        after_json=_json(after),
        note=note,
        ip_address=ip,
        user_agent=(ua or "")[:500] or None,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def snapshot(obj: Any, fields: tuple[str, ...]) -> dict[str, Any]:
    """The named fields of a model instance, for a before/after pair."""
    return {f: getattr(obj, f, None) for f in fields}


def list_logs(
    db: Session,
    *,
    company_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> list[PlatformAuditLog]:
    q = db.query(PlatformAuditLog)
    if company_id is not None:
        q = q.filter(PlatformAuditLog.company_id == company_id)
    if actor_user_id is not None:
        q = q.filter(PlatformAuditLog.actor_user_id == actor_user_id)
    if action:
        q = q.filter(PlatformAuditLog.action == action)
    if target_type:
        q = q.filter(PlatformAuditLog.target_type == target_type)
    return q.order_by(PlatformAuditLog.id.desc()).offset(max(0, offset)).limit(min(limit, 1000)).all()
