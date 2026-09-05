from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import SupportTicket, SupportTicketMessage, User

SLA_HOURS = {"critical": 4, "high": 8, "medium": 24, "low": 72}


def _now():
    return datetime.now(timezone.utc)


def _ticket_number(db: Session) -> str:
    n = db.query(SupportTicket).count() + 1
    return f"TKT-{n:06d}"


def _out(t: SupportTicket) -> dict[str, Any]:
    return {
        "id": t.id,
        "ticket_number": t.ticket_number,
        "company_id": t.company_id,
        "company_name": t.company.name if t.company else None,
        "created_by_user_id": t.created_by_user_id,
        "assigned_to_user_id": t.assigned_to_user_id,
        "assigned_to_name": t.assigned_to.full_name if t.assigned_to else None,
        "subject": t.subject,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "sla_due_at": t.sla_due_at,
        "sla_breached": bool(t.sla_breached),
        "escalated_at": t.escalated_at,
        "resolved_at": t.resolved_at,
        "closed_at": t.closed_at,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "message_count": len(t.messages) if t.messages is not None else 0,
    }


def list_tickets(
    db: Session,
    *,
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to_user_id: Optional[int] = None,
    limit: int = 200,
) -> list[dict]:
    q = db.query(SupportTicket).options(
        joinedload(SupportTicket.company),
        joinedload(SupportTicket.assigned_to),
        joinedload(SupportTicket.messages),
    )
    if company_id:
        q = q.filter(SupportTicket.company_id == company_id)
    if status:
        q = q.filter(SupportTicket.status == status)
    if priority:
        q = q.filter(SupportTicket.priority == priority)
    if assigned_to_user_id:
        q = q.filter(SupportTicket.assigned_to_user_id == assigned_to_user_id)
    rows = q.order_by(SupportTicket.id.desc()).limit(min(limit, 500)).all()
    now = _now()
    for t in rows:
        if t.sla_due_at and t.status not in ("resolved", "closed") and not t.sla_breached:
            due = t.sla_due_at if t.sla_due_at.tzinfo else t.sla_due_at.replace(tzinfo=timezone.utc)
            if due < now:
                t.sla_breached = True
    db.commit()
    return [_out(t) for t in rows]


def get_ticket(db: Session, ticket_id: int) -> dict:
    t = (
        db.query(SupportTicket)
        .options(
            joinedload(SupportTicket.company),
            joinedload(SupportTicket.assigned_to),
            joinedload(SupportTicket.messages).joinedload(SupportTicketMessage.author),
            joinedload(SupportTicket.attachments),
        )
        .filter(SupportTicket.id == ticket_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    data = _out(t)
    data["messages"] = [
        {
            "id": m.id,
            "author_user_id": m.author_user_id,
            "author_name": m.author.full_name if m.author else None,
            "author_email": m.author.email if m.author else None,
            "body": m.body,
            "is_internal": bool(m.is_internal),
            "created_at": m.created_at,
        }
        for m in sorted(t.messages, key=lambda x: x.id)
    ]
    data["attachments"] = [
        {
            "id": a.id,
            "file_name": a.file_name,
            "content_type": a.content_type,
            "size_bytes": a.size_bytes,
            "created_at": a.created_at,
        }
        for a in t.attachments
    ]
    return data


def create_ticket(db: Session, actor: User, payload: dict) -> dict:
    priority = payload.get("priority") or "medium"
    hours = SLA_HOURS.get(priority, 24)
    t = SupportTicket(
        ticket_number=_ticket_number(db),
        company_id=payload.get("company_id"),
        created_by_user_id=actor.id,
        assigned_to_user_id=payload.get("assigned_to_user_id"),
        subject=payload["subject"],
        category=payload.get("category") or "general",
        priority=priority,
        status="open",
        sla_due_at=_now() + timedelta(hours=hours),
    )
    db.add(t)
    db.flush()
    if payload.get("body"):
        db.add(
            SupportTicketMessage(
                ticket_id=t.id,
                author_user_id=actor.id,
                body=payload["body"],
                is_internal=False,
            )
        )
    db.commit()
    return get_ticket(db, t.id)


def update_ticket(db: Session, ticket_id: int, payload: dict) -> dict:
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    for k in ("subject", "category", "priority", "status", "assigned_to_user_id", "company_id"):
        if k in payload and payload[k] is not None:
            setattr(t, k, payload[k])
    status = payload.get("status")
    now = _now()
    if status == "escalated" and not t.escalated_at:
        t.escalated_at = now
    if status == "resolved" and not t.resolved_at:
        t.resolved_at = now
    if status == "closed" and not t.closed_at:
        t.closed_at = now
        if not t.resolved_at:
            t.resolved_at = now
    t.updated_at = now
    db.commit()
    return get_ticket(db, t.id)


def add_message(db: Session, ticket_id: int, actor: User, body: str, is_internal: bool = False) -> dict:
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.add(
        SupportTicketMessage(
            ticket_id=t.id,
            author_user_id=actor.id,
            body=body,
            is_internal=is_internal,
        )
    )
    t.updated_at = _now()
    if t.status == "open":
        t.status = "in_progress"
    db.commit()
    return get_ticket(db, t.id)


def open_ticket_count(db: Session) -> int:
    return db.query(SupportTicket).filter(SupportTicket.status.in_(["open", "in_progress", "escalated"])).count()


def sla_breach_count(db: Session) -> int:
    return db.query(SupportTicket).filter(SupportTicket.sla_breached == True, SupportTicket.status.notin_(["resolved", "closed"])).count()
