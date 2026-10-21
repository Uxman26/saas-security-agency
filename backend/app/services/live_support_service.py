from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timedelta, time, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models import AppNotification, LiveChatConversation, LiveChatEvent, LiveChatMessage, LiveSupportAgent, User
from app.services.admin_platform_ext_service import get_config, set_config

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DAY_LABELS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
STATUS_OPEN = "queued"
STATUS_IN_PROGRESS = ("assigned", "active")
STATUS_CLOSED = ("closed", "resolved")
DEFAULT_OFFLINE = (
    "Live agents are currently unavailable. Continue with the AI assistant or book a demo and we will follow up."
)
DEFAULT_NO_AGENTS = (
    "No agents are online right now. You are in the queue — we will connect you as soon as someone is available."
)


def _default_days() -> dict[str, dict[str, Any]]:
    return {
        str(i): {
            "enabled": i < 5,
            "start": "09:00",
            "end": "17:30",
        }
        for i in range(7)
    }


DEFAULT_AVAILABILITY = {
    "enabled": True,
    "timezone": "Europe/London",
    "days": _default_days(),
    "working_days": [0, 1, 2, 3, 4],
    "start_time": "09:00",
    "end_time": "17:30",
    "offline_message": DEFAULT_OFFLINE,
    "no_agent_message": DEFAULT_NO_AGENTS,
    "contact_email": "",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_hhmm(value: str, fallback: str = "09:00") -> time:
    raw = (value or fallback).strip()
    if not HHMM.match(raw):
        raw = fallback if HHMM.match(fallback) else "09:00"
    parts = raw.split(":")
    return time(int(parts[0]), int(parts[1]))


def _zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo((name or "Europe/London").strip() or "Europe/London")
    except Exception:
        return ZoneInfo("Europe/London")


def _day_row(raw: Any, fallback_start: str, fallback_end: str, enabled: bool) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    start = str(raw.get("start") or fallback_start or "09:00")
    end = str(raw.get("end") or fallback_end or "17:30")
    if not HHMM.match(start):
        start = "09:00"
    if not HHMM.match(end):
        end = "17:30"
    if "enabled" in raw:
        enabled = bool(raw.get("enabled"))
    return {"enabled": enabled, "start": start, "end": end}


def normalize_availability(cfg: dict[str, Any] | None) -> dict[str, Any]:
    provided = dict(cfg or {})
    src = {**DEFAULT_AVAILABILITY, **provided}
    fallback_start = str(src.get("start_time") or "09:00")
    fallback_end = str(src.get("end_time") or "17:30")
    working = provided.get("working_days", src.get("working_days"))
    working_set: set[int] | None = None
    if isinstance(working, list):
        working_set = {int(d) for d in working if str(d).isdigit() and 0 <= int(d) <= 6}
    raw_days = provided.get("days") if isinstance(provided.get("days"), dict) else {}
    days: dict[str, dict[str, Any]] = {}
    for i in range(7):
        key = str(i)
        enabled_default = i in working_set if working_set is not None else i < 5
        days[key] = _day_row(raw_days.get(key), fallback_start, fallback_end, enabled_default)
    enabled_days = [i for i in range(7) if days[str(i)]["enabled"]]
    first_open = next((days[str(i)] for i in enabled_days), {"start": "09:00", "end": "17:30"})
    tz_name = str(src.get("timezone") or "Europe/London")
    try:
        ZoneInfo(tz_name)
    except Exception:
        tz_name = "Europe/London"
    contact = str(src.get("contact_email") or "").strip()
    return {
        "enabled": bool(src.get("enabled", True)),
        "timezone": tz_name,
        "days": days,
        "working_days": enabled_days,
        "start_time": first_open["start"],
        "end_time": first_open["end"],
        "offline_message": str(src.get("offline_message") or DEFAULT_OFFLINE),
        "no_agent_message": str(src.get("no_agent_message") or DEFAULT_NO_AGENTS),
        "contact_email": contact,
    }


def get_availability(db: Session) -> dict[str, Any]:
    cfg = get_config(db, "live_support_availability", DEFAULT_AVAILABILITY) or {}
    if not isinstance(cfg, dict):
        cfg = {}
    return normalize_availability(cfg)


def update_availability(db: Session, payload: dict[str, Any], actor: User) -> dict[str, Any]:
    cfg = get_availability(db)
    incoming = dict(payload or {})
    if "days" in incoming and isinstance(incoming["days"], dict):
        cfg["days"] = incoming["days"]
        incoming.pop("working_days", None)
        incoming.pop("start_time", None)
        incoming.pop("end_time", None)
    for k, v in incoming.items():
        if k in DEFAULT_AVAILABILITY and v is not None and k != "days":
            cfg[k] = v
    cfg = normalize_availability(cfg)
    set_config(db, "live_support_availability", cfg, actor=actor, category="support")
    _log_event(db, None, "availability.updated", actor.id, {"config": cfg})
    db.commit()
    return get_availability(db)


def _within_day_hours(local: datetime, day: dict[str, Any]) -> bool:
    if not day.get("enabled"):
        return False
    start = _parse_hhmm(str(day.get("start") or "09:00"))
    end = _parse_hhmm(str(day.get("end") or "17:30"), "17:30")
    current = local.time()
    if start == end:
        return True
    if start < end:
        return start <= current <= end
    return current >= start or current <= end


def is_within_hours(db: Session, now: datetime | None = None) -> tuple[bool, dict[str, Any]]:
    cfg = get_availability(db)
    if not cfg.get("enabled"):
        return False, cfg
    tz = _zone(cfg.get("timezone"))
    local = (now or _utcnow()).astimezone(tz)
    weekday = int(local.weekday())
    day = cfg["days"].get(str(weekday)) or {"enabled": False}
    if _within_day_hours(local, day):
        return True, cfg
    prev = cfg["days"].get(str((weekday - 1) % 7)) or {"enabled": False}
    if prev.get("enabled"):
        start = _parse_hhmm(str(prev.get("start") or "09:00"))
        end = _parse_hhmm(str(prev.get("end") or "17:30"), "17:30")
        if start > end and local.time() <= end:
            return True, cfg
    return False, cfg


def _next_open(cfg: dict[str, Any], now: datetime | None = None) -> str | None:
    tz = _zone(cfg.get("timezone"))
    local = (now or _utcnow()).astimezone(tz)
    for offset in range(0, 8):
        candidate = local + timedelta(days=offset)
        day = cfg["days"].get(str(int(candidate.weekday()))) or {}
        if not day.get("enabled"):
            continue
        start = _parse_hhmm(str(day.get("start") or "09:00"))
        stamp = candidate.replace(hour=start.hour, minute=start.minute, second=0, microsecond=0)
        if offset == 0 and local.timetz().replace(tzinfo=None) >= start and _within_day_hours(local, day):
            return stamp.isoformat()
        if offset == 0 and local.time() >= start:
            continue
        if offset == 0 and local.time() < start:
            return stamp.isoformat()
        if offset > 0:
            return stamp.isoformat()
    return None


def _hours_summary(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for i in range(7):
        day = cfg["days"][str(i)]
        out.append(
            {
                "weekday": i,
                "label": DAY_LABELS[i],
                "enabled": bool(day["enabled"]),
                "start": day["start"],
                "end": day["end"],
            }
        )
    return out


def availability_status(db: Session) -> dict[str, Any]:
    open_now, cfg = is_within_hours(db)
    agents = (
        db.query(LiveSupportAgent)
        .filter(LiveSupportAgent.is_available == True)  # noqa: E712
        .count()
    )
    if not cfg.get("enabled"):
        reason = "disabled"
    elif not open_now:
        reason = "outside_hours"
    elif agents <= 0:
        reason = "no_agents"
    else:
        reason = "ok"
    available = reason == "ok"
    message = cfg.get("offline_message") or DEFAULT_OFFLINE
    if reason == "no_agents":
        message = cfg.get("no_agent_message") or DEFAULT_NO_AGENTS
    return {
        "available": available,
        "can_queue": open_now and bool(cfg.get("enabled")),
        "within_hours": open_now,
        "agents_online": int(agents),
        "reason": reason,
        "timezone": cfg.get("timezone"),
        "working_days": cfg.get("working_days"),
        "start_time": cfg.get("start_time"),
        "end_time": cfg.get("end_time"),
        "days": _hours_summary(cfg),
        "next_open_at": None if open_now else _next_open(cfg),
        "offline_message": message,
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
        db.flush()
    else:
        row.display_name = display_name or row.display_name or user.full_name
        row.is_available = bool(is_available)
    after = _agent_out(row)
    _log_event(db, None, "agent.upserted", actor.id, {"before": before, "after": after})
    if row.is_available:
        _claim_queued(db, row)
    db.commit()
    db.refresh(row)
    return _agent_out(row)


def set_agent_availability(db: Session, agent_id: int, is_available: bool, actor: User) -> dict[str, Any]:
    row = db.query(LiveSupportAgent).filter(LiveSupportAgent.id == agent_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Agent not found")
    before = row.is_available
    row.is_available = bool(is_available)
    _log_event(db, None, "agent.availability", actor.id, {"agent_id": agent_id, "before": before, "after": row.is_available})
    if row.is_available:
        _claim_queued(db, row)
    db.commit()
    db.refresh(row)
    return _agent_out(row)


def _pick_agent(db: Session) -> LiveSupportAgent | None:
    rows = (
        db.query(LiveSupportAgent)
        .filter(LiveSupportAgent.is_available == True)  # noqa: E712
        .all()
    )
    if not rows:
        return None
    rows.sort(
        key=lambda a: (
            a.last_assigned_at is not None,
            a.last_assigned_at or datetime.min.replace(tzinfo=timezone.utc),
            a.id,
        )
    )
    return rows[0]


def _claim_queued(db: Session, agent: LiveSupportAgent) -> None:
    queued = (
        db.query(LiveChatConversation)
        .filter(LiveChatConversation.status == STATUS_OPEN)
        .order_by(LiveChatConversation.created_at.asc())
        .first()
    )
    if not queued:
        return
    queued.agent_id = agent.id
    queued.assigned_at = _utcnow()
    queued.status = "assigned"
    agent.last_assigned_at = _utcnow()
    db.add(
        LiveChatMessage(
            conversation_id=queued.id,
            sender_type="system",
            sender_name="System",
            body=f"Connected with {agent.display_name}. How can we help?",
        )
    )
    _log_event(db, queued.id, "conversation.assigned", None, {"agent_id": agent.id, "source": "queue"})
    _notify_agent_assigned(
        db,
        agent,
        conv_id=queued.id,
        title="Queued live chat assigned",
        body=f"{queued.visitor_name} ({queued.visitor_company}) is waiting.",
    )


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
                "code": "outside_hours",
                "message": cfg.get("offline_message") or DEFAULT_OFFLINE,
                "contact_email": cfg.get("contact_email") or None,
                "timezone": cfg.get("timezone"),
                "next_open_at": _next_open(cfg),
                "days": _hours_summary(cfg),
            },
        )
    agent = _pick_agent(db)
    public_id = f"LC-{secrets.token_hex(8).upper()}"
    visitor_token = secrets.token_urlsafe(24)
    now = _utcnow()
    conv = LiveChatConversation(
        public_id=public_id,
        visitor_token=visitor_token,
        visitor_name=full_name.strip(),
        visitor_email=email.strip().lower(),
        visitor_company=company_name.strip(),
        visitor_city=city.strip(),
        status="assigned" if agent else STATUS_OPEN,
        agent_id=agent.id if agent else None,
        assigned_at=now if agent else None,
    )
    if agent:
        agent.last_assigned_at = now
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
    if agent:
        system_body = f"Connected with {agent.display_name}. How can we help?"
        event = "conversation.assigned"
    else:
        system_body = cfg.get("no_agent_message") or DEFAULT_NO_AGENTS
        event = "conversation.queued"
    db.add(
        LiveChatMessage(
            conversation_id=conv.id,
            sender_type="system",
            sender_name="System",
            body=system_body,
        )
    )
    if agent:
        _notify_agent_assigned(
            db,
            agent,
            conv_id=conv.id,
            title="New live chat",
            body=f"{full_name.strip()} ({company_name.strip()}) started a live chat from {city.strip()}.",
        )
    _log_event(
        db,
        conv.id,
        event,
        None,
        {
            "agent_id": agent.id if agent else None,
            "public_id": public_id,
            "visitor_email": email.strip().lower(),
            "visitor_name": full_name.strip(),
            "visitor_company": company_name.strip(),
            "visitor_city": city.strip(),
        },
    )
    db.commit()
    return get_conversation(db, public_id, visitor_token=visitor_token, include_token=True)


def _load_conversation(db: Session, public_id: str) -> LiveChatConversation:
    conv = (
        db.query(LiveChatConversation)
        .options(
            joinedload(LiveChatConversation.agent),
            joinedload(LiveChatConversation.messages),
            joinedload(LiveChatConversation.events),
        )
        .filter(LiveChatConversation.public_id == public_id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


def _assert_visitor_token(conv: LiveChatConversation, token: str | None) -> None:
    stored = (conv.visitor_token or "").strip()
    if not stored:
        return
    if not token or not secrets.compare_digest(stored, token.strip()):
        raise HTTPException(status_code=404, detail="Conversation not found")


def get_conversation(
    db: Session,
    public_id: str,
    visitor_token: str | None = None,
    *,
    include_token: bool = False,
    require_token: bool = False,
) -> dict[str, Any]:
    conv = _load_conversation(db, public_id)
    if require_token or conv.visitor_token:
        _assert_visitor_token(conv, visitor_token)
    return _conv_out(conv, include_token=include_token)


def get_conversation_by_id(db: Session, conversation_id: int, *, include_token: bool = False) -> dict[str, Any]:
    conv = (
        db.query(LiveChatConversation)
        .options(
            joinedload(LiveChatConversation.agent),
            joinedload(LiveChatConversation.messages),
            joinedload(LiveChatConversation.events),
        )
        .filter(LiveChatConversation.id == conversation_id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _conv_out(conv, include_token=include_token)


def post_visitor_message(db: Session, public_id: str, body: str, visitor_token: str | None = None) -> dict[str, Any]:
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.public_id == public_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _assert_visitor_token(conv, visitor_token)
    if conv.status in STATUS_CLOSED:
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
    if conv.status == "assigned":
        conv.status = "active"
    if conv.agent_id:
        agent = db.query(LiveSupportAgent).filter(LiveSupportAgent.id == conv.agent_id).first()
        if agent:
            _notify_agent_assigned(
                db,
                agent,
                conv_id=conv.id,
                title="Live chat reply",
                body=f"{conv.visitor_name}: {text[:180]}",
            )
    _log_event(db, conv.id, "message.visitor", None, {"preview": text[:180]})
    db.commit()
    return get_conversation(db, public_id, visitor_token=visitor_token, include_token=True)


def post_agent_message(db: Session, conversation_id: int, agent_user: User, body: str) -> dict[str, Any]:
    agent = db.query(LiveSupportAgent).filter(LiveSupportAgent.user_id == agent_user.id).first()
    if not agent:
        raise HTTPException(status_code=403, detail="Not a live support agent")
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.status in STATUS_CLOSED:
        raise HTTPException(status_code=400, detail="Conversation is closed")
    if conv.agent_id and conv.agent_id != agent.id:
        raise HTTPException(status_code=403, detail="Conversation assigned to another agent")
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")
    if not conv.agent_id:
        conv.agent_id = agent.id
        conv.assigned_at = _utcnow()
        _log_event(db, conv.id, "conversation.assigned", agent_user.id, {"agent_id": agent.id, "source": "reply"})
    conv.status = "active"
    db.add(
        LiveChatMessage(
            conversation_id=conv.id,
            sender_type="agent",
            sender_name=agent.display_name,
            body=text[:4000],
        )
    )
    _log_event(db, conv.id, "message.agent", agent_user.id, {"preview": text[:180]})
    db.commit()
    return get_conversation_by_id(db, conv.id)


def list_conversations(
    db: Session,
    *,
    status: str | None = None,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    query = db.query(LiveChatConversation).options(joinedload(LiveChatConversation.agent))
    status_key = (status or "open").strip().lower()
    if status_key in ("open", "queued"):
        query = query.filter(LiveChatConversation.status == STATUS_OPEN)
    elif status_key in ("in_progress", "assigned", "active"):
        query = query.filter(LiveChatConversation.status.in_(list(STATUS_IN_PROGRESS)))
    elif status_key in ("closed", "resolved"):
        query = query.filter(LiveChatConversation.status.in_(list(STATUS_CLOSED)))
    elif status_key not in ("all", "", "any"):
        query = query.filter(LiveChatConversation.status == status_key)
    needle = (q or "").strip()
    if needle:
        like = f"%{needle}%"
        query = query.filter(
            or_(
                LiveChatConversation.public_id.ilike(like),
                LiveChatConversation.visitor_name.ilike(like),
                LiveChatConversation.visitor_email.ilike(like),
                LiveChatConversation.visitor_company.ilike(like),
                LiveChatConversation.visitor_city.ilike(like),
            )
        )
    total = query.order_by(None).count()
    rows = (
        query.order_by(LiveChatConversation.created_at.desc())
        .offset(max(0, offset))
        .limit(min(max(limit, 1), 200))
        .all()
    )
    return {
        "total": total,
        "items": [_conv_out(c, include_messages=False) for c in rows],
    }


def list_open_conversations(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(LiveChatConversation)
        .options(joinedload(LiveChatConversation.agent))
        .filter(LiveChatConversation.status.in_([STATUS_OPEN, *STATUS_IN_PROGRESS]))
        .order_by(LiveChatConversation.created_at.desc())
        .limit(100)
        .all()
    )
    return [_conv_out(c, include_messages=False) for c in rows]


def conversation_report(db: Session) -> dict[str, Any]:
    rows = db.query(LiveChatConversation).all()
    counts = {"open": 0, "in_progress": 0, "closed": 0, "total": len(rows)}
    for c in rows:
        counts[_status_label(c.status).lower().replace(" ", "_")] = (
            counts.get(_status_label(c.status).lower().replace(" ", "_"), 0) + 1
        )
    counts["open"] = sum(1 for c in rows if c.status == STATUS_OPEN)
    counts["in_progress"] = sum(1 for c in rows if c.status in STATUS_IN_PROGRESS)
    counts["closed"] = sum(1 for c in rows if c.status in STATUS_CLOSED)
    week_ago = _utcnow() - timedelta(days=7)
    recent = [c for c in rows if c.created_at and _as_utc(c.created_at) >= week_ago]
    return {
        "counts": counts,
        "started_last_7_days": len(recent),
        "closed_last_7_days": sum(1 for c in recent if c.status in STATUS_CLOSED),
        "agents_online": db.query(LiveSupportAgent).filter(LiveSupportAgent.is_available == True).count(),  # noqa: E712
        "within_hours": is_within_hours(db)[0],
    }


def close_conversation(db: Session, conversation_id: int, actor: User) -> dict[str, Any]:
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.status in STATUS_CLOSED:
        return get_conversation_by_id(db, conv.id)
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
    _log_event(db, conv.id, "conversation.closed", actor.id, {"public_id": conv.public_id})
    db.commit()
    return get_conversation_by_id(db, conv.id)


def reopen_conversation(db: Session, conversation_id: int, actor: User) -> dict[str, Any]:
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    agent = _pick_agent(db)
    conv.closed_at = None
    if agent:
        conv.agent_id = agent.id
        conv.assigned_at = _utcnow()
        conv.status = "assigned"
        agent.last_assigned_at = _utcnow()
        body = f"This conversation was reopened and connected with {agent.display_name}."
    else:
        conv.status = STATUS_OPEN
        body = "This conversation was reopened and is waiting for an available agent."
    db.add(
        LiveChatMessage(
            conversation_id=conv.id,
            sender_type="system",
            sender_name="System",
            body=body,
        )
    )
    _log_event(
        db,
        conv.id,
        "conversation.reopened",
        actor.id,
        {"public_id": conv.public_id, "agent_id": conv.agent_id, "status": conv.status},
    )
    db.commit()
    return get_conversation_by_id(db, conv.id)


def reassign_round_robin(db: Session, conversation_id: int, actor: User) -> dict[str, Any]:
    conv = db.query(LiveChatConversation).filter(LiveChatConversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.status in STATUS_CLOSED:
        raise HTTPException(status_code=400, detail="Reopen the conversation before reassigning")
    agent = _pick_agent(db)
    if not agent:
        raise HTTPException(status_code=503, detail="No available agents")
    prev = conv.agent_id
    conv.agent_id = agent.id
    conv.assigned_at = _utcnow()
    conv.status = "assigned"
    agent.last_assigned_at = _utcnow()
    db.add(
        LiveChatMessage(
            conversation_id=conv.id,
            sender_type="system",
            sender_name="System",
            body=f"Conversation reassigned to {agent.display_name}.",
        )
    )
    _log_event(db, conv.id, "conversation.reassigned", actor.id, {"from": prev, "to": agent.id})
    db.commit()
    return get_conversation_by_id(db, conv.id)


def _notify_agent_assigned(
    db: Session,
    agent: LiveSupportAgent,
    *,
    conv_id: int,
    title: str,
    body: str,
) -> None:
    user = agent.user or db.query(User).filter(User.id == agent.user_id).first()
    if not user:
        return
    if user.company_id:
        db.add(
            AppNotification(
                company_id=user.company_id,
                user_id=user.id,
                kind="live_support",
                title=title,
                body=body,
                entity_type="live_chat",
                entity_id=conv_id,
            )
        )
    to = (user.email or "").strip()
    if not to:
        return
    try:
        from app.services import email_service

        email_service.send_email_async(to, title, body)
    except Exception:
        pass


def _agent_out(a: LiveSupportAgent) -> dict[str, Any]:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "display_name": a.display_name,
        "email": a.user.email if a.user else None,
        "is_available": bool(a.is_available),
        "last_assigned_at": a.last_assigned_at.isoformat() if a.last_assigned_at else None,
    }


def _status_label(status: str | None) -> str:
    s = (status or "").lower()
    if s == STATUS_OPEN:
        return "Open"
    if s in STATUS_IN_PROGRESS:
        return "In Progress"
    if s in STATUS_CLOSED:
        return "Closed"
    return status or "Open"


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _conv_out(c: LiveChatConversation, include_messages: bool = True, include_token: bool = False) -> dict[str, Any]:
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
            for m in sorted(c.messages or [], key=lambda x: (x.created_at is None, x.id))
        ]
    events = []
    if include_messages:
        for ev in sorted(c.events or [], key=lambda x: x.id):
            try:
                detail = json.loads(ev.detail_json) if ev.detail_json else {}
            except (TypeError, ValueError):
                detail = {}
            events.append(
                {
                    "id": ev.id,
                    "event_type": ev.event_type,
                    "actor_user_id": ev.actor_user_id,
                    "detail": detail,
                    "created_at": ev.created_at.isoformat() if ev.created_at else None,
                }
            )
    last_msg = msgs[-1]["created_at"] if msgs else (c.created_at.isoformat() if c.created_at else None)
    out: dict[str, Any] = {
        "id": c.id,
        "public_id": c.public_id,
        "visitor_name": c.visitor_name,
        "visitor_email": c.visitor_email,
        "visitor_company": c.visitor_company,
        "visitor_city": c.visitor_city,
        "status": c.status,
        "status_label": _status_label(c.status),
        "agent_id": c.agent_id,
        "agent_name": c.agent.display_name if c.agent else None,
        "assigned_at": c.assigned_at.isoformat() if c.assigned_at else None,
        "closed_at": c.closed_at.isoformat() if c.closed_at else None,
        "started_at": c.created_at.isoformat() if c.created_at else None,
        "ended_at": c.closed_at.isoformat() if c.closed_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "last_message_at": last_msg if include_messages else (c.created_at.isoformat() if c.created_at else None),
        "message_count": len(msgs) if include_messages else None,
        "messages": msgs if include_messages else [],
        "events": events if include_messages else [],
    }
    if include_token and c.visitor_token:
        out["visitor_token"] = c.visitor_token
    return out


def _log_event(db: Session, conversation_id: Optional[int], event_type: str, actor_user_id: Optional[int], detail: dict) -> None:
    db.add(
        LiveChatEvent(
            conversation_id=conversation_id,
            event_type=event_type,
            actor_user_id=actor_user_id,
            detail_json=json.dumps(detail, default=str),
        )
    )
