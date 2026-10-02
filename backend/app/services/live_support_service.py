from __future__ import annotations

import json
import secrets
from datetime import datetime, time, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import LiveChatConversation, LiveChatEvent, LiveChatMessage, LiveSupportAgent, User
from app.services.admin_platform_ext_service import get_config, set_config

DEFAULT_AVAILABILITY = {
    "enabled": True,
    "timezone": "Europe/London",
    "working_days": [0, 1, 2, 3, 4],
    "start_time": "09:00",
    "end_time": "17:30",
    "offline_message": "Live agents are currently unavailable. Continue with the AI assistant or book a demo and we will follow up.",
    "contact_email": "",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_hhmm(value: str) -> time:
    parts = (value or "09:00").strip().split(":")
    return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)


def get_availability(db: Session) -> dict[str, Any]:
    cfg = get_config(db, "live_support_availability", DEFAULT_AVAILABILITY) or {}
    return {**DEFAULT_AVAILABILITY, **cfg}


def update_availability(db: Session, payload: dict[str, Any], actor: User) -> dict[str, Any]:
    cfg = get_availability(db)
    for k, v in payload.items():
        if k in DEFAULT_AVAILABILITY and v is not None:
            cfg[k] = v
    days = cfg.get("working_days") or []
    cfg["working_days"] = sorted({int(d) for d in days if 0 <= int(d) <= 6})
    set_config(db, "live_support_availability", cfg, actor=actor, category="support")
    _log_event(db, None, "availability.updated", actor.id, {"config": cfg})
    return get_availability(db)


def is_within_hours(db: Session, now: datetime | None = None) -> tuple[bool, dict[str, Any]]:
    cfg = get_availability(db)
    if not cfg.get("enabled"):
        return False, cfg
    tz_name = cfg.get("timezone") or "Europe/London"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Europe/London")
    local = (now or _utcnow()).astimezone(tz)
    if int(local.weekday()) not in set(cfg.get("working_days") or []):
        return False, cfg
    start = _parse_hhmm(str(cfg.get("start_time") or "09:00"))
    end = _parse_hhmm(str(cfg.get("end_time") or "17:30"))
    current = local.timetz().replace(tzinfo=None)
    open_now = start <= current <= end if start <= end else current >= start or current <= end
    return open_now, cfg


def availability_status(db: Session) -> dict[str, Any]:
    open_now, cfg = is_within_hours(db)
    agents = (
        db.query(LiveSupportAgent)
        .filter(LiveSupportAgent.is_available == True)
        .count()
    )
    available = open_now and agents > 0
    return {
        "available": available,
        "within_hours": open_now,
        "agents_online": int(agents),
        "timezone": cfg.get("timezone"),
        "working_days": cfg.get("working_days"),
        "start_time": cfg.get("start_time"),
        "end_time": cfg.get("end_time"),
        "offline_message": cfg.get("offline_message"),
        "contact_email": cfg.get("contact_email") or None,
    }


def list_agents(db: Session) -> list[dict[str, Any]]:
    rows = db.query(LiveSupportAgent).options(joinedload(LiveSupportAgent.user)).order_by(LiveSupportAgent.id).all()
    return [_agent_out(a) for a in rows]


def upsert_agent(db: Session, user_id: int, display_name: str, is_available: bool, actor: User) -> dict[str, Any]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or getattr(user, "role", None) != "super_admin":
        raise HTTPException(status_code=400, detail="Live agents must be platform admin users")
    row = db.query(LiveSupportAgent).filter(LiveSupportAgent.user_id == user_id).first()
    before = _agent_out(row) if row else None
    if not row:
        row = LiveSupportAgent(user_id=user_id, display_name=display_name or user.full_name, is_available=is_available)
        db.add(row)
    else:
        row.display_name = display_name or row.display_name or user.full_name
        row.is_available = bool(is_available)
    db.commit()
    db.refresh(row)
    after = _agent_out(row)
    _log_event(db, None, "agent.upserted", actor.id, {"before": before, "after": after})
    return after


def set_agent_availability(db: Session, agent_id: int, is_available: bool, actor: User) -> dict[str, Any]:
    row = db.query(LiveSupportAgent).filter(LiveSupportAgent.id == agent_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Agent not found")
    before = row.is_available
    row.is_available = bool(is_available)
    db.commit()
    db.refresh(row)
    _log_event(db, None, "agent.availability", actor.id, {"agent_id": agent_id, "before": before, "after": row.is_available})
    return _agent_out(row)


def _pick_agent(db: Session) -> LiveSupportAgent | None:
    rows = (
        db.query(LiveSupportAgent)
        .filter(LiveSupportAgent.is_available == True)
        .all()
    )
    if not rows:
        return None
    rows.sort(key=lambda a: (a.last_assigned_at is not None, a.last_assigned_at or datetime.min.replace(tzinfo=timezone.utc), a.id))
    return rows[0]


def start_conversation(
    db: Session,
    *,
    full_name: str,
    email: str,
    company_name: str,
    city: str,
    initial_message: str | None = None,
) -> dict[str, Any]:
    open_now, cfg = is_within_hours(db)
    if not open_now:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "agents_unavailable",
                "message": cfg.get("offline_message") or DEFAULT_AVAILABILITY["offline_message"],
                "contact_email": cfg.get("contact_email") or None,
            },
        )
    agent = _pick_agent(db)
    if not agent:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "agents_unavailable",
                "message": cfg.get("offline_message") or DEFAULT_AVAILABILITY["offline_message"],
                "contact_email": cfg.get("contact_email") or None,
            },
        )
    public_id = f"LC-{secrets.token_hex(8).upper()}"
    conv = LiveChatConversation(
        public_id=public_id,
        visitor_name=full_name.strip(),
        visitor_email=email.strip().lower(),
        visitor_company=company_name.strip(),
        visitor_city=city.strip(),
        status="assigned",
        agent_id=agent.id,
        assigned_at=_utcnow(),
    )
    agent.last_assigned_at = _utcnow()
    db.add(conv)
    db.flush()
    if initial_message and initial_message.strip():
        db.add(
            LiveChatMessage(
                conversation_id=conv.id,
                sender_type="visitor",
                sender_name=full_name.strip(),
                body=initial_message.strip()[:4000],
            )
        )
    db.add(
        LiveChatMessage(
            conversation_id=conv.id,
            sender_type="system",
            sender_name="System",
            body=f"Connected with {agent.display_name}. How can we help?",
        )
    )
    db.commit()
    db.refresh(conv)
    _log_event(
        db,
        conv.id,
        "conversation.assigned",
        None,
        {"agent_id": agent.id, "public_id": public_id, "visitor_email": email.strip().lower()},
    )
    return get_conversation(db, public_id)


def get_conversation(db: Session, public_id: str) -> dict[str, Any]:
    conv = (
        db.query(LiveChatConversation)
        .options(joinedload(LiveChatConversation.agent), joinedload(LiveChatConversation.messages))
        .filter(LiveChatConversation.public_id == public_id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _conv_out(conv)


def post_visitor_message(db: Session, public_id: str, body: str) -> dict[str, Any]:
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.public_id == public_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.status in ("closed", "resolved"):
        raise HTTPException(status_code=400, detail="Conversation is closed")
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")
    db.add(
        LiveChatMessage(
            conversation_id=conv.id,
            sender_type="visitor",
            sender_name=conv.visitor_name,
            body=text[:4000],
        )
    )
    db.commit()
    return get_conversation(db, public_id)


def post_agent_message(db: Session, conversation_id: int, agent_user: User, body: str) -> dict[str, Any]:
    agent = db.query(LiveSupportAgent).filter(LiveSupportAgent.user_id == agent_user.id).first()
    if not agent:
        raise HTTPException(status_code=403, detail="Not a live support agent")
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.agent_id and conv.agent_id != agent.id:
        raise HTTPException(status_code=403, detail="Conversation assigned to another agent")
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")
    if not conv.agent_id:
        conv.agent_id = agent.id
        conv.assigned_at = _utcnow()
        conv.status = "assigned"
    db.add(
        LiveChatMessage(
            conversation_id=conv.id,
            sender_type="agent",
            sender_name=agent.display_name,
            body=text[:4000],
        )
    )
    db.commit()
    return get_conversation(db, conv.public_id)


def list_open_conversations(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(LiveChatConversation)
        .options(joinedload(LiveChatConversation.agent))
        .filter(LiveChatConversation.status.in_(["queued", "assigned", "active"]))
        .order_by(LiveChatConversation.created_at.desc())
        .limit(100)
        .all()
    )
    return [_conv_out(c, include_messages=False) for c in rows]


def close_conversation(db: Session, conversation_id: int, actor: User) -> dict[str, Any]:
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.status = "closed"
    conv.closed_at = _utcnow()
    db.add(
        LiveChatMessage(
            conversation_id=conv.id,
            sender_type="system",
            sender_name="System",
            body="This conversation was closed by an agent.",
        )
    )
    db.commit()
    _log_event(db, conv.id, "conversation.closed", actor.id, {"public_id": conv.public_id})
    return get_conversation(db, conv.public_id)


def reassign_round_robin(db: Session, conversation_id: int, actor: User) -> dict[str, Any]:
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    agent = _pick_agent(db)
    if not agent:
        raise HTTPException(status_code=503, detail="No available agents")
    prev = conv.agent_id
    conv.agent_id = agent.id
    conv.assigned_at = _utcnow()
    conv.status = "assigned"
    agent.last_assigned_at = _utcnow()
    db.commit()
    _log_event(db, conv.id, "conversation.reassigned", actor.id, {"from": prev, "to": agent.id})
    return get_conversation(db, conv.public_id)


def _agent_out(a: LiveSupportAgent) -> dict[str, Any]:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "display_name": a.display_name,
        "email": a.user.email if a.user else None,
        "is_available": bool(a.is_available),
        "last_assigned_at": a.last_assigned_at.isoformat() if a.last_assigned_at else None,
    }


def _conv_out(c: LiveChatConversation, include_messages: bool = True) -> dict[str, Any]:
    msgs = []
    if include_messages:
        msgs = [
            {
                "id": m.id,
                "sender_type": m.sender_type,
                "sender_name": m.sender_name,
                "body": m.body,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in sorted(c.messages or [], key=lambda x: x.id)
        ]
    return {
        "id": c.id,
        "public_id": c.public_id,
        "visitor_name": c.visitor_name,
        "visitor_email": c.visitor_email,
        "visitor_company": c.visitor_company,
        "visitor_city": c.visitor_city,
        "status": c.status,
        "agent_id": c.agent_id,
        "agent_name": c.agent.display_name if c.agent else None,
        "assigned_at": c.assigned_at.isoformat() if c.assigned_at else None,
        "closed_at": c.closed_at.isoformat() if c.closed_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "messages": msgs,
    }


def _log_event(db: Session, conversation_id: Optional[int], event_type: str, actor_user_id: Optional[int], detail: dict) -> None:
    db.add(
        LiveChatEvent(
            conversation_id=conversation_id,
            event_type=event_type,
            actor_user_id=actor_user_id,
            detail_json=json.dumps(detail),
        )
    )
    db.commit()
