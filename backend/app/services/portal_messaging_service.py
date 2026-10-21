"""Cross-device portal messaging for ControlOps mobile."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import (
    AppNotification,
    Assignment,
    Guard,
    PortalMessage,
    PortalMessageThread,
    ShiftAuditLog,
    User,
)
from app.services.company_service import get_company_by_user_id
from app.services import fcm_push_service, membership_service
from app.services.portal_access import (
    get_linked_guard,
    is_client_portal_user,
    is_portal_role,
    is_staff_portal_user,
    role_slug,
)

_STAFF_ASSIGN_ACTIONS = frozenset(
    {
        "shift_assigned",
        "shift_published",
        "shift_reassigned",
        "shift_added_to_rota",
        "shift_created",
    }
)


def _pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def _user_name(u: User) -> str:
    return (u.full_name or u.email or f"User #{u.id}").strip()


def _is_ops_user(user: User) -> bool:
    if not user or not user.is_active:
        return False
    return not is_staff_portal_user(user) and not is_client_portal_user(user)


def _staff_assigner_ids(db: Session, staff: User, company_id: int) -> set[int]:
    guard = get_linked_guard(db, staff)
    ids: set[int] = set()
    if not guard:
        return ids
    for row in (
        db.query(Assignment.created_by_user_id)
        .filter(
            Assignment.guard_id == guard.id,
            Assignment.created_by_user_id.isnot(None),
        )
        .distinct()
        .all()
    ):
        if row[0]:
            ids.add(int(row[0]))
    for row in (
        db.query(ShiftAuditLog.user_id)
        .filter(
            ShiftAuditLog.company_id == company_id,
            ShiftAuditLog.guard_id == guard.id,
            ShiftAuditLog.action.in_(_STAFF_ASSIGN_ACTIONS),
            ShiftAuditLog.user_id.isnot(None),
        )
        .distinct()
        .all()
    ):
        if row[0]:
            ids.add(int(row[0]))
    ids.discard(staff.id)
    return ids


def _ops_user_ids(db: Session, company_id: int, exclude_id: int) -> set[int]:
    return {
        u.id
        for u in membership_service.users_in_company(db, company_id)
        if u.id != exclude_id and _is_ops_user(u)
    }


def staff_authorized_peer_ids(db: Session, staff: User, company_id: int) -> set[int]:
    ops = _ops_user_ids(db, company_id, staff.id)
    assigners = _staff_assigner_ids(db, staff, company_id) & ops
    return assigners or ops


def _assert_messaging_peer_allowed(db: Session, sender: User, peer: User, company_id: int) -> None:
    if not peer.is_active:
        raise HTTPException(status_code=404, detail="Peer user not found")
    if not membership_service.belongs_to_company(db, peer, company_id):
        raise HTTPException(status_code=404, detail="Peer user not found")
    if not is_portal_role(sender):
        return
    if is_staff_portal_user(sender):
        if peer.id not in staff_authorized_peer_ids(db, sender, company_id):
            raise HTTPException(
                status_code=403,
                detail="Staff can only message the controller or administrator who assigned their shift",
            )
        return
    if is_client_portal_user(sender):
        if is_portal_role(peer):
            raise HTTPException(
                status_code=403,
                detail="Clients can only message ControlOps controllers or admins",
            )
        return


def _resolve_peer_user_id(db: Session, company_id: int, peer_id: str, sender: User) -> int:
    peer_id = (peer_id or "").strip()
    if peer_id.startswith("user:"):
        uid = int(peer_id.split(":", 1)[1])
        from app.services import membership_service

        user = db.query(User).filter(User.id == uid).first()
        if not user or not membership_service.belongs_to_company(db, user, company_id):
            raise HTTPException(status_code=404, detail="Peer user not found")
        _assert_messaging_peer_allowed(db, sender, user, company_id)
        return user.id
    if peer_id.startswith("guard:"):
        gid = int(peer_id.split(":", 1)[1])
        guard = (
            db.query(Guard)
            .filter(Guard.id == gid, Guard.company_id == company_id)
            .first()
        )
        if not guard:
            raise HTTPException(status_code=404, detail="Peer staff not found")
        from app.services import membership_service

        ids = membership_service.user_ids_for_guard(db, company_id, gid)
        user = db.query(User).filter(User.id.in_(ids)).first() if ids else None
        if not user and guard.email:
            user = db.query(User).filter(User.email == guard.email).first()
            if user and not membership_service.belongs_to_company(db, user, company_id):
                user = None
        if not user:
            raise HTTPException(
                status_code=404,
                detail="That staff member has no ControlOps login for messaging",
            )
        _assert_messaging_peer_allowed(db, sender, user, company_id)
        return user.id
    raise HTTPException(status_code=400, detail="peer_id must be user:{id} or guard:{id}")


def _thread_out(db: Session, thread: PortalMessageThread, viewer_id: int) -> dict:
    peer_id = thread.user_b_id if thread.user_a_id == viewer_id else thread.user_a_id
    peer = db.query(User).filter(User.id == peer_id).first()
    unread = (
        db.query(PortalMessage)
        .filter(
            PortalMessage.thread_id == thread.id,
            PortalMessage.sender_user_id != viewer_id,
            PortalMessage.read_at.is_(None),
        )
        .count()
    )
    return {
        "id": f"t{thread.id}",
        "peer_id": f"user:{peer_id}",
        "peer_name": _user_name(peer) if peer else f"User #{peer_id}",
        "peer_email": peer.email if peer else None,
        "peer_role": getattr(peer, "role", None) if peer else None,
        "updated_at": (thread.updated_at or datetime.now(timezone.utc)).isoformat(),
        "last_message": thread.last_message,
        "unread_count": unread,
    }


def _message_out(db: Session, msg: PortalMessage) -> dict:
    sender = db.query(User).filter(User.id == msg.sender_user_id).first()
    return {
        "id": str(msg.id),
        "thread_id": f"t{msg.thread_id}",
        "sender_peer_id": f"user:{msg.sender_user_id}",
        "sender_name": _user_name(sender) if sender else f"User #{msg.sender_user_id}",
        "body": msg.body or "",
        "created_at": (msg.created_at or datetime.now(timezone.utc)).isoformat(),
        "read": msg.read_at is not None or False,
    }


def list_threads(db: Session, user: User) -> list[dict]:
    company = get_company_by_user_id(db, user.id)
    rows = (
        db.query(PortalMessageThread)
        .filter(
            PortalMessageThread.company_id == company.id,
            (PortalMessageThread.user_a_id == user.id)
            | (PortalMessageThread.user_b_id == user.id),
        )
        .order_by(PortalMessageThread.updated_at.desc())
        .limit(200)
        .all()
    )
    allowed = None
    if is_staff_portal_user(user):
        allowed = staff_authorized_peer_ids(db, user, company.id)
    out = []
    for t in rows:
        peer_id = t.user_b_id if t.user_a_id == user.id else t.user_a_id
        if allowed is not None and peer_id not in allowed:
            continue
        out.append(_thread_out(db, t, user.id))
    return out


def list_contacts(db: Session, user: User) -> list[dict]:
    company = get_company_by_user_id(db, user.id)
    if is_staff_portal_user(user):
        ids = staff_authorized_peer_ids(db, user, company.id)
    elif is_client_portal_user(user):
        ids = _ops_user_ids(db, company.id, user.id)
    else:
        ids = {
            u.id
            for u in membership_service.users_in_company(db, company.id)
            if u.id != user.id and u.is_active
        }
    if not ids:
        return []
    rows = (
        db.query(User)
        .filter(User.id.in_(ids), User.is_active.is_(True))
        .order_by(User.full_name, User.email)
        .all()
    )
    return [
        {
            "id": f"user:{u.id}",
            "peer_id": f"user:{u.id}",
            "name": _user_name(u),
            "full_name": _user_name(u),
            "email": u.email,
            "role": role_slug(u),
            "source": "assigner" if is_staff_portal_user(user) else "user",
        }
        for u in rows
    ]


def get_or_create_thread(db: Session, user: User, peer_id: str) -> dict:
    company = get_company_by_user_id(db, user.id)
    peer_user_id = _resolve_peer_user_id(db, company.id, peer_id, user)
    if peer_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    a, b = _pair(user.id, peer_user_id)
    thread = (
        db.query(PortalMessageThread)
        .filter(
            PortalMessageThread.company_id == company.id,
            PortalMessageThread.user_a_id == a,
            PortalMessageThread.user_b_id == b,
        )
        .first()
    )
    if not thread:
        thread = PortalMessageThread(
            company_id=company.id,
            user_a_id=a,
            user_b_id=b,
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)
    return _thread_out(db, thread, user.id)


def _get_owned_thread(db: Session, user: User, thread_key: str) -> PortalMessageThread:
    company = get_company_by_user_id(db, user.id)
    raw = thread_key.strip()
    if raw.startswith("t"):
        raw = raw[1:]
    try:
        thread_id = int(raw)
    except ValueError:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread = (
        db.query(PortalMessageThread)
        .filter(
            PortalMessageThread.id == thread_id,
            PortalMessageThread.company_id == company.id,
        )
        .first()
    )
    if not thread or user.id not in (thread.user_a_id, thread.user_b_id):
        raise HTTPException(status_code=404, detail="Thread not found")
    if is_staff_portal_user(user):
        peer_id = thread.user_b_id if thread.user_a_id == user.id else thread.user_a_id
        if peer_id not in staff_authorized_peer_ids(db, user, company.id):
            raise HTTPException(status_code=404, detail="Thread not found")
    return thread


def get_thread(db: Session, user: User, thread_key: str) -> dict:
    thread = _get_owned_thread(db, user, thread_key)
    messages = (
        db.query(PortalMessage)
        .filter(PortalMessage.thread_id == thread.id)
        .order_by(PortalMessage.created_at.asc())
        .limit(500)
        .all()
    )
    return {
        "thread": _thread_out(db, thread, user.id),
        "messages": [_message_out(db, m) for m in messages],
    }


def post_message(
    db: Session,
    user: User,
    thread_key: str,
    body: str,
    client_message_id: Optional[str] = None,
) -> dict:
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message body is required")
    thread = _get_owned_thread(db, user, thread_key)
    company = get_company_by_user_id(db, user.id)

    if client_message_id:
        existing = (
            db.query(PortalMessage)
            .filter(
                PortalMessage.thread_id == thread.id,
                PortalMessage.sender_user_id == user.id,
                PortalMessage.client_message_id == client_message_id,
            )
            .first()
        )
        if existing:
            return _message_out(db, existing)

    msg = PortalMessage(
        company_id=company.id,
        thread_id=thread.id,
        sender_user_id=user.id,
        body=text[:5000],
        client_message_id=client_message_id,
        read_at=datetime.now(timezone.utc),  # sender has read their own message
    )
    db.add(msg)
    thread.last_message = text[:280]
    thread.updated_at = datetime.now(timezone.utc)
    db.flush()

    recipient_id = thread.user_b_id if thread.user_a_id == user.id else thread.user_a_id
    notif = AppNotification(
        company_id=company.id,
        user_id=recipient_id,
        kind="message",
        title=f"Message from {_user_name(user)}",
        body=text[:500],
        entity_type="message_thread",
        entity_id=thread.id,
    )
    db.add(notif)
    db.commit()
    db.refresh(msg)
    db.refresh(notif)

    fcm_push_service.notify_after_app_notification(
        db,
        user_id=recipient_id,
        notification_id=notif.id,
        kind="message",
        title=notif.title,
        body=notif.body or "",
        entity_type="message_thread",
        entity_id=thread.id,
    )
    return _message_out(db, msg)


def mark_thread_read(db: Session, user: User, thread_key: str) -> dict:
    thread = _get_owned_thread(db, user, thread_key)
    now = datetime.now(timezone.utc)
    (
        db.query(PortalMessage)
        .filter(
            PortalMessage.thread_id == thread.id,
            PortalMessage.sender_user_id != user.id,
            PortalMessage.read_at.is_(None),
        )
        .update({PortalMessage.read_at: now}, synchronize_session=False)
    )
    db.commit()
    return _thread_out(db, thread, user.id)
