"""Cross-device portal messaging for ControlOps mobile."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import AppNotification, Guard, PortalMessage, PortalMessageThread, User
from app.services.company_service import get_company_by_user_id
from app.services import fcm_push_service
from app.services.portal_access import is_client_portal_user, is_portal_role, is_staff_portal_user


def _pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def _user_name(u: User) -> str:
    return (u.full_name or u.email or f"User #{u.id}").strip()


def _assert_messaging_peer_allowed(sender: User, peer: User) -> None:
    """Restrict who portal users may open threads with inside a tenant.

    - Internal / ops roles may message anyone in the company.
    - Staff/guards may message internal/ops users and other staff/guards (not clients).
    - Clients may message internal/ops users only.
    """
    if not peer.is_active:
        raise HTTPException(status_code=404, detail="Peer user not found")
    if not is_portal_role(sender):
        return
    if is_staff_portal_user(sender):
        if is_client_portal_user(peer):
            raise HTTPException(
                status_code=403,
                detail="Staff cannot message client accounts",
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
        _assert_messaging_peer_allowed(sender, user)
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
        _assert_messaging_peer_allowed(sender, user)
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
    return [_thread_out(db, t, user.id) for t in rows]


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
