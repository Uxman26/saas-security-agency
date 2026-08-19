"""Lone worker check calls: session, scheduled safety checks, escalation, closure.

The flow this implements, end to end:

    OFF DUTY -> SESSION ACTIVE -> SAFE -> CHECK DUE -> GRACE PERIOD -> MISSED CHECK ->
    ESCALATING -> RESPONDER ACKNOWLEDGED -> SAFE / INCIDENT / EMERGENCY ->
    SESSION COMPLETED

Two design points worth knowing before reading on.

*Timing lives on the session, not on the policy.* A session copies ``check_in_minutes``,
``reminder_minutes`` and ``grace_minutes`` from the policy when it starts. Editing a
policy mid-shift therefore never retroactively changes whether a worker was overdue,
which matters because these rows are evidence.

*The sweep is the only clock.* :func:`sweep` runs every minute from the arq worker and is
the single place that fires reminders, converts an unanswered check into a missed check,
and walks the escalation ladder. Nothing is scheduled per-session, so a worker restart
cannot lose a pending timer — state is always recomputed from ``due_at``.

An SOS deliberately bypasses all of that: it opens an incident at level 1 immediately,
without waiting for a check window or a grace period.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.middleware.client_source import get_client_source
from app.models import (
    AppNotification,
    Guard,
    LoneWorkerCheck,
    LoneWorkerEscalationContact,
    LoneWorkerEvent,
    LoneWorkerIncident,
    LoneWorkerPolicy,
    LoneWorkerSession,
    Site,
    User,
)
from app.schemas import (
    LoneWorkerAlarmRequest,
    LoneWorkerCheckIn,
    LoneWorkerContactAttempt,
    LoneWorkerContactResponse,
    LoneWorkerIncidentResponse,
    LoneWorkerPolicyCreate,
    LoneWorkerPolicyResponse,
    LoneWorkerPolicyUpdate,
    LoneWorkerResolveRequest,
    LoneWorkerSessionEnd,
    LoneWorkerSessionResponse,
    LoneWorkerSessionStart,
)
from app.services.company_service import get_company_by_user_id
from app.services.portal_access import is_staff_portal_user, pinned_site_ids

# --- Event vocabulary ----------------------------------------------------------------

EVENT_LABELS: dict[str, str] = {
    "session_started": "Lone working started",
    "session_ended": "Lone working ended",
    "check_scheduled": "Check call scheduled",
    "check_reminder": "Check call reminder sent",
    "check_in": "Worker confirmed safe",
    "check_in_late": "Worker confirmed safe (late)",
    "check_missed": "Missed check call",
    "assistance_requested": "Assistance requested",
    "sos_activated": "SOS emergency activated",
    "escalated": "Escalated",
    "notification_sent": "Escalation notification sent",
    "acknowledged": "Responder acknowledged",
    "contact_attempt": "Contact attempt logged",
    "marked_safe": "Worker marked safe",
    "incident_resolved": "Incident resolved",
    "location_recorded": "Location recorded",
}


def event_label(event_type: str) -> str:
    return EVENT_LABELS.get(event_type, (event_type or "").replace("_", " ").capitalize())


# --- Small helpers -------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands back naive datetimes even for timezone=True columns."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _actor_name(user: Optional[User]) -> str:
    if not user:
        return "System"
    return user.full_name or user.email or "User"


def _guard_phone(guard: Optional[Guard]) -> Optional[str]:
    if not guard:
        return None
    for p in (guard.phone, guard.work_phone):
        if p and str(p).strip():
            return str(p).strip()
    return None


def _resolve_guard(db: Session, user: User, company_id: int, guard_id: Optional[int]) -> Guard:
    """Staff-portal logins are always pinned to their own guard record."""
    if is_staff_portal_user(user) or not guard_id:
        if getattr(user, "guard_id", None):
            g = db.query(Guard).filter(Guard.id == user.guard_id, Guard.company_id == company_id).first()
            if g:
                return g
        if is_staff_portal_user(user):
            raise HTTPException(status_code=400, detail="This login is not linked to a staff record")
    if guard_id:
        g = db.query(Guard).filter(Guard.id == guard_id, Guard.company_id == company_id).first()
        if not g:
            raise HTTPException(status_code=404, detail="Guard not found")
        return g
    raise HTTPException(status_code=400, detail="guard_id is required")


# --- Audit log -----------------------------------------------------------------------


def log_event(
    db: Session,
    *,
    company_id: int,
    event_type: str,
    message: str = "",
    session: Optional[LoneWorkerSession] = None,
    incident: Optional[LoneWorkerIncident] = None,
    check: Optional[LoneWorkerCheck] = None,
    actor: Optional[User] = None,
    escalation_level: Optional[int] = None,
    channel: Optional[str] = None,
    recipient: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    accuracy: Optional[float] = None,
    source: Optional[str] = None,
) -> LoneWorkerEvent:
    """Append one audit row. The caller commits — the log joins the transaction it describes.

    Names are snapshotted next to the ids so the history still reads correctly after a
    guard is archived or a site renamed.
    """
    guard = (session.guard if session else None) or (incident.guard if incident else None)
    site = (session.site if session else None) or (incident.site if incident else None)
    row = LoneWorkerEvent(
        company_id=company_id,
        session_id=session.id if session else (incident.session_id if incident else None),
        incident_id=incident.id if incident else None,
        check_id=check.id if check else None,
        guard_id=guard.id if guard else None,
        guard_name=guard.full_name if guard else "",
        site_id=site.id if site else None,
        site_name=site.name if site else "",
        event_type=event_type,
        message=message,
        escalation_level=escalation_level,
        channel=channel,
        recipient=recipient,
        actor_user_id=actor.id if actor else None,
        actor_name=_actor_name(actor),
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        source=source or get_client_source(),
    )
    db.add(row)
    return row


# --- Policies ------------------------------------------------------------------------


def _contact_out(c: LoneWorkerEscalationContact) -> LoneWorkerContactResponse:
    return LoneWorkerContactResponse(
        id=c.id,
        policy_id=c.policy_id,
        level=c.level,
        user_id=c.user_id,
        name=c.name or (c.user.full_name if c.user else None),
        email=c.email or (c.user.email if c.user else None),
        phone=c.phone,
    )


def _policy_out(p: LoneWorkerPolicy) -> LoneWorkerPolicyResponse:
    return LoneWorkerPolicyResponse(
        id=p.id,
        company_id=p.company_id,
        site_id=p.site_id,
        site_name=p.site.name if p.site else None,
        name=p.name,
        check_in_minutes=p.check_in_minutes,
        reminder_minutes=p.reminder_minutes,
        grace_minutes=p.grace_minutes,
        escalation_interval_minutes=p.escalation_interval_minutes,
        require_location=bool(p.require_location),
        status=p.status or "active",
        contacts=[_contact_out(c) for c in sorted(p.contacts or [], key=lambda c: (c.level, c.id))],
    )


def list_policies(db: Session, user: User, site_id: Optional[int] = None) -> list[LoneWorkerPolicyResponse]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(LoneWorkerPolicy)
        .options(joinedload(LoneWorkerPolicy.site), joinedload(LoneWorkerPolicy.contacts))
        .filter(LoneWorkerPolicy.company_id == company.id)
    )
    if site_id:
        q = q.filter(LoneWorkerPolicy.site_id == site_id)
    pinned = pinned_site_ids(db, user)
    if pinned is not None:
        # A site-pinned login sees its sites' policies plus the company-wide default.
        q = q.filter((LoneWorkerPolicy.site_id.is_(None)) | (LoneWorkerPolicy.site_id.in_(pinned or {0})))
    return [_policy_out(p) for p in q.order_by(LoneWorkerPolicy.id.desc()).all()]


def _apply_contacts(db: Session, policy: LoneWorkerPolicy, contacts: Iterable) -> None:
    for c in list(policy.contacts or []):
        db.delete(c)
    policy.contacts = []
    for c in contacts or []:
        db.add(
            LoneWorkerEscalationContact(
                company_id=policy.company_id,
                policy=policy,
                level=c.level,
                user_id=c.user_id,
                name=c.name,
                email=c.email,
                phone=c.phone,
            )
        )


def _assert_site(db: Session, company_id: int, site_id: Optional[int]) -> None:
    if site_id and not db.query(Site).filter(Site.id == site_id, Site.company_id == company_id).first():
        raise HTTPException(status_code=422, detail="Invalid site_id")


def create_policy(db: Session, user: User, data: LoneWorkerPolicyCreate) -> LoneWorkerPolicyResponse:
    company = get_company_by_user_id(db, user.id)
    _assert_site(db, company.id, data.site_id)
    policy = LoneWorkerPolicy(
        company_id=company.id,
        site_id=data.site_id,
        name=data.name,
        check_in_minutes=data.check_in_minutes,
        reminder_minutes=data.reminder_minutes,
        grace_minutes=data.grace_minutes,
        escalation_interval_minutes=data.escalation_interval_minutes,
        require_location=data.require_location,
        status=data.status or "active",
    )
    db.add(policy)
    db.flush()
    _apply_contacts(db, policy, data.contacts)
    db.commit()
    db.refresh(policy)
    return _policy_out(policy)


def _owned_policy(db: Session, company_id: int, policy_id: int) -> LoneWorkerPolicy:
    p = (
        db.query(LoneWorkerPolicy)
        .options(joinedload(LoneWorkerPolicy.contacts))
        .filter(LoneWorkerPolicy.id == policy_id, LoneWorkerPolicy.company_id == company_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Policy not found")
    return p


def update_policy(db: Session, user: User, policy_id: int, data: LoneWorkerPolicyUpdate) -> LoneWorkerPolicyResponse:
    company = get_company_by_user_id(db, user.id)
    policy = _owned_policy(db, company.id, policy_id)
    payload = data.model_dump(exclude_unset=True)
    contacts = payload.pop("contacts", None)
    if "site_id" in payload:
        _assert_site(db, company.id, payload["site_id"])
    for k, v in payload.items():
        setattr(policy, k, v)
    if contacts is not None:
        _apply_contacts(db, policy, data.contacts or [])
    db.commit()
    db.refresh(policy)
    return _policy_out(policy)


def delete_policy(db: Session, user: User, policy_id: int) -> None:
    company = get_company_by_user_id(db, user.id)
    policy = _owned_policy(db, company.id, policy_id)
    if db.query(LoneWorkerSession).filter(LoneWorkerSession.policy_id == policy.id, LoneWorkerSession.status == "active").first():
        raise HTTPException(status_code=409, detail="Policy is in use by an active session")
    db.delete(policy)
    db.commit()


def resolve_policy(
    db: Session, company_id: int, site_id: Optional[int], policy_id: Optional[int] = None
) -> Optional[LoneWorkerPolicy]:
    """Explicit policy, else the site's policy, else the company-wide default."""
    if policy_id:
        return _owned_policy(db, company_id, policy_id)
    q = db.query(LoneWorkerPolicy).filter(
        LoneWorkerPolicy.company_id == company_id, LoneWorkerPolicy.status == "active"
    )
    if site_id:
        found = q.filter(LoneWorkerPolicy.site_id == site_id).order_by(LoneWorkerPolicy.id.desc()).first()
        if found:
            return found
    return q.filter(LoneWorkerPolicy.site_id.is_(None)).order_by(LoneWorkerPolicy.id.desc()).first()


# --- Derived status ------------------------------------------------------------------


def open_check(db: Session, session_id: int) -> Optional[LoneWorkerCheck]:
    return (
        db.query(LoneWorkerCheck)
        .filter(LoneWorkerCheck.session_id == session_id, LoneWorkerCheck.status == "pending")
        .order_by(LoneWorkerCheck.due_at.asc())
        .first()
    )


def open_incident(db: Session, session_id: int) -> Optional[LoneWorkerIncident]:
    return (
        db.query(LoneWorkerIncident)
        .filter(
            LoneWorkerIncident.session_id == session_id,
            LoneWorkerIncident.status.in_(["escalating", "acknowledged"]),
        )
        .order_by(LoneWorkerIncident.id.desc())
        .first()
    )


_INCIDENT_DISPLAY = {
    ("sos", "escalating"): "EMERGENCY",
    ("sos", "acknowledged"): "RESPONDER INVESTIGATING",
    ("assistance", "escalating"): "ASSISTANCE REQUESTED",
    ("assistance", "acknowledged"): "RESPONDER INVESTIGATING",
    ("missed_check", "escalating"): "ESCALATING",
    ("missed_check", "acknowledged"): "RESPONDER INVESTIGATING",
}


def incident_display_status(inc: LoneWorkerIncident) -> str:
    if inc.status == "resolved":
        return f"RESOLVED — {(inc.resolution or 'safe').upper()}"
    return _INCIDENT_DISPLAY.get((inc.kind, inc.status), inc.status.upper())


def session_display_status(
    sess: LoneWorkerSession,
    check: Optional[LoneWorkerCheck],
    inc: Optional[LoneWorkerIncident],
    now: Optional[datetime] = None,
) -> str:
    """The single label the mobile timer and the monitor board both show."""
    if sess.status != "active":
        return "SESSION COMPLETED"
    if inc is not None:
        return incident_display_status(inc)
    if check is None:
        return "SESSION ACTIVE"
    now = now or _now()
    due = _aware(check.due_at)
    if due is None:
        return "SESSION ACTIVE"
    if now >= due + timedelta(minutes=sess.grace_minutes or 0):
        return "MISSED CHECK"
    if now >= due:
        return "GRACE PERIOD"
    if now >= due - timedelta(minutes=sess.reminder_minutes or 0):
        return "CHECK DUE"
    return "SAFE"


def _session_out(db: Session, sess: LoneWorkerSession, now: Optional[datetime] = None) -> LoneWorkerSessionResponse:
    now = now or _now()
    check = open_check(db, sess.id) if sess.status == "active" else None
    inc = open_incident(db, sess.id) if sess.status == "active" else None
    due = _aware(check.due_at) if check else None
    return LoneWorkerSessionResponse(
        id=sess.id,
        company_id=sess.company_id,
        guard_id=sess.guard_id,
        guard_name=sess.guard.full_name if sess.guard else None,
        site_id=sess.site_id,
        site_name=sess.site.name if sess.site else None,
        policy_id=sess.policy_id,
        location_note=sess.location_note,
        check_in_minutes=sess.check_in_minutes,
        reminder_minutes=sess.reminder_minutes,
        grace_minutes=sess.grace_minutes,
        started_at=_aware(sess.started_at),
        expected_end_at=_aware(sess.expected_end_at),
        ended_at=_aware(sess.ended_at),
        last_check_in_at=_aware(sess.last_check_in_at),
        status=sess.status,
        source=sess.source,
        display_status=session_display_status(sess, check, inc, now),
        next_check_due_at=due,
        seconds_to_next_check=int((due - now).total_seconds()) if due else None,
        open_incident_id=inc.id if inc else None,
        open_incident_kind=inc.kind if inc else None,
        latitude=sess.latitude,
        longitude=sess.longitude,
    )


# --- Notification fan-out ------------------------------------------------------------


def _contacts_for(db: Session, sess: Optional[LoneWorkerSession], level: int) -> list[LoneWorkerEscalationContact]:
    if not sess or not sess.policy_id:
        return []
    return (
        db.query(LoneWorkerEscalationContact)
        .options(joinedload(LoneWorkerEscalationContact.user))
        .filter(
            LoneWorkerEscalationContact.policy_id == sess.policy_id,
            LoneWorkerEscalationContact.level == level,
        )
        .all()
    )


def max_escalation_level(db: Session, sess: Optional[LoneWorkerSession]) -> int:
    if not sess or not sess.policy_id:
        return 0
    levels = [
        c.level
        for c in db.query(LoneWorkerEscalationContact)
        .filter(LoneWorkerEscalationContact.policy_id == sess.policy_id)
        .all()
    ]
    return max(levels) if levels else 0


def _try_send(db: Session, send) -> bool:
    """Run one delivery inside a savepoint.

    A provider error is not the only risk: ``send_and_log`` and ``send_sms`` both INSERT a
    log row, and a failing INSERT leaves the whole session in a rolled-back state. Plain
    try/except would swallow the exception and then every later write — including the
    escalation itself — would die on PendingRollbackError. The savepoint confines the
    damage to the send, so an unreachable ARC mailbox can never stop the ladder.
    """
    try:
        with db.begin_nested():
            send()
        return True
    except Exception:
        return False


def notify_level(db: Session, inc: LoneWorkerIncident, level: int, actor: Optional[User] = None) -> int:
    """Email + SMS + in-app to every contact on one rung. Each send is logged as its own
    audit event so the record shows exactly who was told, how, and when.

    Delivery failures are swallowed: an unreachable ARC mailbox must not roll back the
    escalation itself.
    """
    from app.services import email_service, sms_service

    sess = inc.session
    contacts = _contacts_for(db, sess, level)
    subject = f"{inc.kind.replace('_', ' ').title()} — {inc.guard.full_name if inc.guard else 'Lone worker'}"
    where = inc.site.name if inc.site else (sess.location_note if sess else "")
    body = (
        f"{event_label('escalated')} (level {level}).\n"
        f"Worker: {inc.guard.full_name if inc.guard else 'Unknown'}\n"
        f"Site: {where or 'not recorded'}\n"
        f"Opened: {(_aware(inc.opened_at) or _now()).strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        f"{inc.notes or ''}"
    ).strip()

    sent = 0
    for c in contacts:
        email = c.email or (c.user.email if c.user else None)
        phone = c.phone
        name = c.name or (c.user.full_name if c.user else "") or email or phone or "contact"
        if email:
            ok = _try_send(db, lambda: email_service.send_and_log(db, inc.company_id, email, subject, body, "lone_worker_escalation"))
            log_event(
                db,
                company_id=inc.company_id,
                event_type="notification_sent",
                message=f"Level {level} email to {name}" + ("" if ok else " — delivery failed"),
                session=sess,
                incident=inc,
                actor=actor,
                escalation_level=level,
                channel="email",
                recipient=email,
                source="system",
            )
            sent += 1
        if phone:
            sms_user_id = c.user_id or (actor.id if actor else None) or (sess.user_id if sess else None)
            ok = _try_send(db, lambda: sms_service.send_sms(db, sms_user_id, phone, body[:320], "lone_worker_escalation"))
            log_event(
                db,
                company_id=inc.company_id,
                event_type="notification_sent",
                message=f"Level {level} SMS to {name}" + ("" if ok else " — delivery failed"),
                session=sess,
                incident=inc,
                actor=actor,
                escalation_level=level,
                channel="sms",
                recipient=phone,
                source="system",
            )
            sent += 1
        if c.user_id:
            db.add(
                AppNotification(
                    company_id=inc.company_id,
                    user_id=c.user_id,
                    kind="lone_worker",
                    title=subject,
                    body=body[:500],
                    entity_type="lone_worker_incident",
                    entity_id=inc.id,
                )
            )
            log_event(
                db,
                company_id=inc.company_id,
                event_type="notification_sent",
                message=f"Level {level} in-app alert to {name}",
                session=sess,
                incident=inc,
                actor=actor,
                escalation_level=level,
                channel="in_app",
                recipient=name,
                source="system",
            )
            sent += 1
    return sent


def escalate(db: Session, inc: LoneWorkerIncident, actor: Optional[User] = None) -> LoneWorkerIncident:
    """Move the incident one rung up the ladder and notify that rung."""
    now = _now()
    inc.escalation_level = (inc.escalation_level or 0) + 1
    inc.last_escalated_at = now
    log_event(
        db,
        company_id=inc.company_id,
        event_type="escalated",
        message=f"Escalated to level {inc.escalation_level}",
        session=inc.session,
        incident=inc,
        actor=actor,
        escalation_level=inc.escalation_level,
        source="system" if actor is None else None,
    )
    notify_level(db, inc, inc.escalation_level, actor=actor)
    return inc


# --- Sessions and checks -------------------------------------------------------------


def _schedule_check(db: Session, sess: LoneWorkerSession, *, from_time: Optional[datetime] = None) -> LoneWorkerCheck:
    base = from_time or _now()
    last_seq = (
        db.query(LoneWorkerCheck)
        .filter(LoneWorkerCheck.session_id == sess.id)
        .order_by(LoneWorkerCheck.sequence.desc())
        .first()
    )
    check = LoneWorkerCheck(
        company_id=sess.company_id,
        session_id=sess.id,
        guard_id=sess.guard_id,
        sequence=(last_seq.sequence + 1) if last_seq else 1,
        due_at=base + timedelta(minutes=max(sess.check_in_minutes or 60, 1)),
        status="pending",
    )
    db.add(check)
    db.flush()
    log_event(
        db,
        company_id=sess.company_id,
        event_type="check_scheduled",
        message=f"Next check due {check.due_at.strftime('%Y-%m-%d %H:%M')} UTC",
        session=sess,
        check=check,
        source="system",
    )
    return check


def current_session(db: Session, user: User, guard_id: Optional[int] = None) -> Optional[LoneWorkerSessionResponse]:
    """The caller's live session — what the mobile app polls to render its timer."""
    company = get_company_by_user_id(db, user.id)
    guard = _resolve_guard(db, user, company.id, guard_id)
    sess = (
        db.query(LoneWorkerSession)
        .options(joinedload(LoneWorkerSession.guard), joinedload(LoneWorkerSession.site))
        .filter(
            LoneWorkerSession.company_id == company.id,
            LoneWorkerSession.guard_id == guard.id,
            LoneWorkerSession.status == "active",
        )
        .order_by(LoneWorkerSession.id.desc())
        .first()
    )
    return _session_out(db, sess) if sess else None


def start_session(db: Session, user: User, data: LoneWorkerSessionStart) -> LoneWorkerSessionResponse:
    company = get_company_by_user_id(db, user.id)
    guard = _resolve_guard(db, user, company.id, data.guard_id)
    _assert_site(db, company.id, data.site_id)

    existing = (
        db.query(LoneWorkerSession)
        .filter(
            LoneWorkerSession.company_id == company.id,
            LoneWorkerSession.guard_id == guard.id,
            LoneWorkerSession.status == "active",
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A lone working session is already active")

    policy = resolve_policy(db, company.id, data.site_id, data.policy_id)
    if policy and policy.require_location and (data.latitude is None or data.longitude is None):
        raise HTTPException(status_code=422, detail="Location is required to start lone working at this site")

    sess = LoneWorkerSession(
        company_id=company.id,
        guard_id=guard.id,
        user_id=user.id,
        site_id=data.site_id,
        policy_id=policy.id if policy else None,
        assignment_id=data.assignment_id,
        location_note=data.location_note,
        check_in_minutes=data.check_in_minutes or (policy.check_in_minutes if policy else 60),
        reminder_minutes=policy.reminder_minutes if policy else 5,
        grace_minutes=policy.grace_minutes if policy else 5,
        escalation_interval_minutes=policy.escalation_interval_minutes if policy else 5,
        expected_end_at=data.expected_end_at,
        status="active",
        latitude=data.latitude,
        longitude=data.longitude,
        accuracy=data.accuracy,
        device_id=data.device_id,
        source=get_client_source(),
    )
    db.add(sess)
    db.flush()
    db.refresh(sess)
    log_event(
        db,
        company_id=company.id,
        event_type="session_started",
        message=f"Lone working started{f' at {sess.site.name}' if sess.site else ''}"
        + (f" ({data.location_note})" if data.location_note else ""),
        session=sess,
        actor=user,
        latitude=data.latitude,
        longitude=data.longitude,
        accuracy=data.accuracy,
    )
    _schedule_check(db, sess)
    db.commit()
    db.refresh(sess)
    return _session_out(db, sess)


def _session_for(db: Session, user: User, company_id: int, session_id: Optional[int], *, own_only: bool) -> LoneWorkerSession:
    q = (
        db.query(LoneWorkerSession)
        .options(joinedload(LoneWorkerSession.guard), joinedload(LoneWorkerSession.site))
        .filter(LoneWorkerSession.company_id == company_id)
    )
    if session_id:
        q = q.filter(LoneWorkerSession.id == session_id)
    else:
        q = q.filter(LoneWorkerSession.status == "active")
    if own_only:
        guard = _resolve_guard(db, user, company_id, None)
        q = q.filter(LoneWorkerSession.guard_id == guard.id)
    sess = q.order_by(LoneWorkerSession.id.desc()).first()
    if not sess:
        raise HTTPException(status_code=404, detail="No lone working session found")
    return sess


def check_in(db: Session, user: User, data: LoneWorkerCheckIn) -> LoneWorkerSessionResponse:
    """I'M SAFE. Answers the open check, then starts the next check period.

    A worker who answers after the grace period has expired still lands here — the
    missed check and its escalation history stay in the log, and the open incident is
    left for a responder to close rather than being auto-resolved.
    """
    company = get_company_by_user_id(db, user.id)
    sess = _session_for(db, user, company.id, data.session_id, own_only=is_staff_portal_user(user))
    if sess.status != "active":
        raise HTTPException(status_code=409, detail="Session is not active")

    now = _now()
    check = None
    if data.check_id:
        check = (
            db.query(LoneWorkerCheck)
            .filter(LoneWorkerCheck.id == data.check_id, LoneWorkerCheck.session_id == sess.id)
            .first()
        )
    check = check or open_check(db, sess.id)
    if check is None:
        # The sweep has already closed the window off as missed, so there is no pending
        # check to answer. Attach the late confirmation to that missed check rather than
        # recording it as an ordinary on-time check-in.
        check = (
            db.query(LoneWorkerCheck)
            .filter(LoneWorkerCheck.session_id == sess.id, LoneWorkerCheck.status == "missed")
            .order_by(LoneWorkerCheck.due_at.desc())
            .first()
        )

    late = False
    if check and check.status == "pending":
        due = _aware(check.due_at)
        late = bool(due and now > due + timedelta(minutes=sess.grace_minutes or 0))
        check.status = "safe_late" if late else "safe"
        check.responded_at = now
        check.latitude = data.latitude
        check.longitude = data.longitude
        check.accuracy = data.accuracy
        check.source = get_client_source()
    elif check and check.status == "missed":
        # The sweep already closed it off; record the late confirmation against it.
        late = True
        check.responded_at = now

    sess.last_check_in_at = now
    if data.latitude is not None and data.longitude is not None:
        sess.latitude, sess.longitude, sess.accuracy = data.latitude, data.longitude, data.accuracy

    log_event(
        db,
        company_id=company.id,
        event_type="check_in_late" if late else "check_in",
        message=data.note or ("Worker confirmed safe after a missed check" if late else "Worker confirmed safe"),
        session=sess,
        check=check,
        actor=user,
        latitude=data.latitude,
        longitude=data.longitude,
        accuracy=data.accuracy,
    )
    _schedule_check(db, sess, from_time=now)
    db.commit()
    db.refresh(sess)
    return _session_out(db, sess)


def raise_alarm(db: Session, user: User, data: LoneWorkerAlarmRequest) -> LoneWorkerIncidentResponse:
    """I NEED ASSISTANCE / SOS — opens an incident and escalates immediately.

    SOS does not wait for a check window or a grace period, which is the whole point of
    it being a separate control from the check call.
    """
    company = get_company_by_user_id(db, user.id)
    kind = "assistance" if str(data.kind or "").lower().startswith("assist") else "sos"
    sess = _session_for(db, user, company.id, data.session_id, own_only=is_staff_portal_user(user))

    inc = LoneWorkerIncident(
        company_id=company.id,
        session_id=sess.id,
        guard_id=sess.guard_id,
        site_id=sess.site_id,
        kind=kind,
        status="escalating",
        escalation_level=0,
        notes=data.notes,
        latitude=data.latitude if data.latitude is not None else sess.latitude,
        longitude=data.longitude if data.longitude is not None else sess.longitude,
        accuracy=data.accuracy,
    )
    db.add(inc)
    db.flush()
    db.refresh(inc)
    log_event(
        db,
        company_id=company.id,
        event_type="sos_activated" if kind == "sos" else "assistance_requested",
        message=data.notes or ("SOS activated by worker" if kind == "sos" else "Assistance requested by worker"),
        session=sess,
        incident=inc,
        actor=user,
        latitude=inc.latitude,
        longitude=inc.longitude,
        accuracy=data.accuracy,
    )
    escalate(db, inc, actor=user)
    db.commit()
    db.refresh(inc)
    return _incident_out(inc)


def end_session(db: Session, user: User, data: LoneWorkerSessionEnd) -> LoneWorkerSessionResponse:
    """END LONE WORKING. Refuses while an incident is still open, so a worker cannot
    walk away from an unresolved escalation."""
    company = get_company_by_user_id(db, user.id)
    sess = _session_for(db, user, company.id, data.session_id, own_only=is_staff_portal_user(user))
    if sess.status != "active":
        return _session_out(db, sess)

    inc = open_incident(db, sess.id)
    if inc is not None:
        raise HTTPException(
            status_code=409,
            detail="An open lone worker incident must be resolved by a responder before the session can end",
        )

    now = _now()
    sess.status = "completed"
    sess.ended_at = now
    for c in db.query(LoneWorkerCheck).filter(LoneWorkerCheck.session_id == sess.id, LoneWorkerCheck.status == "pending").all():
        c.status = "cancelled"
    if data.latitude is not None and data.longitude is not None:
        sess.latitude, sess.longitude, sess.accuracy = data.latitude, data.longitude, data.accuracy
    log_event(
        db,
        company_id=company.id,
        event_type="session_ended",
        message=data.note or ("Worker confirmed they finished safely" if data.confirm_safe else "Session ended"),
        session=sess,
        actor=user,
        latitude=data.latitude,
        longitude=data.longitude,
        accuracy=data.accuracy,
    )
    db.commit()
    db.refresh(sess)
    return _session_out(db, sess)


# --- Monitoring (controller / supervisor) --------------------------------------------


def _scope_sites(db: Session, user: User, q, column):
    pinned = pinned_site_ids(db, user)
    if pinned is not None:
        q = q.filter(column.in_(pinned or {0}))
    return q


def list_sessions(
    db: Session,
    user: User,
    status: Optional[str] = "active",
    site_id: Optional[int] = None,
    guard_id: Optional[int] = None,
    limit: int = 200,
) -> list[LoneWorkerSessionResponse]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(LoneWorkerSession)
        .options(joinedload(LoneWorkerSession.guard), joinedload(LoneWorkerSession.site))
        .filter(LoneWorkerSession.company_id == company.id)
    )
    if status and status != "all":
        q = q.filter(LoneWorkerSession.status == status)
    if site_id:
        q = q.filter(LoneWorkerSession.site_id == site_id)
    if guard_id:
        q = q.filter(LoneWorkerSession.guard_id == guard_id)
    if is_staff_portal_user(user):
        q = q.filter(LoneWorkerSession.guard_id == _resolve_guard(db, user, company.id, None).id)
    q = _scope_sites(db, user, q, LoneWorkerSession.site_id)
    now = _now()
    rows = q.order_by(LoneWorkerSession.started_at.desc()).limit(max(1, min(limit, 500))).all()
    return [_session_out(db, s, now) for s in rows]


def _incident_out(inc: LoneWorkerIncident) -> LoneWorkerIncidentResponse:
    return LoneWorkerIncidentResponse(
        id=inc.id,
        company_id=inc.company_id,
        session_id=inc.session_id,
        check_id=inc.check_id,
        guard_id=inc.guard_id,
        guard_name=inc.guard.full_name if inc.guard else None,
        site_id=inc.site_id,
        site_name=inc.site.name if inc.site else None,
        guard_phone=_guard_phone(inc.guard),
        kind=inc.kind,
        status=inc.status,
        escalation_level=inc.escalation_level or 0,
        opened_at=_aware(inc.opened_at),
        acknowledged_at=_aware(inc.acknowledged_at),
        acknowledged_by=inc.acknowledged_by.full_name if inc.acknowledged_by else None,
        resolved_at=_aware(inc.resolved_at),
        resolved_by=inc.resolved_by.full_name if inc.resolved_by else None,
        resolution=inc.resolution,
        notes=inc.notes,
        latitude=inc.latitude,
        longitude=inc.longitude,
        display_status=incident_display_status(inc),
    )


def list_incidents(
    db: Session,
    user: User,
    status: Optional[str] = None,
    kind: Optional[str] = None,
    site_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 200,
) -> list[LoneWorkerIncidentResponse]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(LoneWorkerIncident)
        .options(
            joinedload(LoneWorkerIncident.guard),
            joinedload(LoneWorkerIncident.site),
            joinedload(LoneWorkerIncident.acknowledged_by),
            joinedload(LoneWorkerIncident.resolved_by),
        )
        .filter(LoneWorkerIncident.company_id == company.id)
    )
    if status == "open":
        q = q.filter(LoneWorkerIncident.status.in_(["escalating", "acknowledged"]))
    elif status:
        q = q.filter(LoneWorkerIncident.status == status)
    if kind:
        q = q.filter(LoneWorkerIncident.kind == kind)
    if site_id:
        q = q.filter(LoneWorkerIncident.site_id == site_id)
    if start_date:
        q = q.filter(LoneWorkerIncident.opened_at >= start_date)
    if end_date:
        q = q.filter(LoneWorkerIncident.opened_at < end_date)
    if is_staff_portal_user(user):
        q = q.filter(LoneWorkerIncident.guard_id == _resolve_guard(db, user, company.id, None).id)
    q = _scope_sites(db, user, q, LoneWorkerIncident.site_id)
    rows = q.order_by(LoneWorkerIncident.opened_at.desc()).limit(max(1, min(limit, 1000))).all()
    return [_incident_out(r) for r in rows]


def _owned_incident(db: Session, user: User, incident_id: int) -> LoneWorkerIncident:
    company = get_company_by_user_id(db, user.id)
    inc = (
        db.query(LoneWorkerIncident)
        .options(joinedload(LoneWorkerIncident.session), joinedload(LoneWorkerIncident.guard), joinedload(LoneWorkerIncident.site))
        .filter(LoneWorkerIncident.id == incident_id, LoneWorkerIncident.company_id == company.id)
        .first()
    )
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    pinned = pinned_site_ids(db, user)
    if pinned is not None and inc.site_id not in (pinned or set()):
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc


def acknowledge_incident(db: Session, user: User, incident_id: int, notes: Optional[str] = None) -> LoneWorkerIncidentResponse:
    """Acknowledgement stops the escalation ladder but deliberately does NOT close the
    incident — closing it is a separate, explicit decision."""
    inc = _owned_incident(db, user, incident_id)
    if inc.status == "resolved":
        raise HTTPException(status_code=409, detail="Incident is already resolved")
    now = _now()
    inc.status = "acknowledged"
    inc.acknowledged_at = inc.acknowledged_at or now
    inc.acknowledged_by_user_id = inc.acknowledged_by_user_id or user.id
    log_event(
        db,
        company_id=inc.company_id,
        event_type="acknowledged",
        message=notes or "Responder acknowledged and is investigating",
        session=inc.session,
        incident=inc,
        actor=user,
        escalation_level=inc.escalation_level,
    )
    db.commit()
    db.refresh(inc)
    return _incident_out(inc)


def escalate_incident(db: Session, user: User, incident_id: int, notes: Optional[str] = None) -> LoneWorkerIncidentResponse:
    inc = _owned_incident(db, user, incident_id)
    if inc.status == "resolved":
        raise HTTPException(status_code=409, detail="Incident is already resolved")
    if notes:
        inc.notes = f"{inc.notes}\n{notes}" if inc.notes else notes
    # A manual escalation resumes the ladder even if it had been acknowledged.
    inc.status = "escalating"
    escalate(db, inc, actor=user)
    db.commit()
    db.refresh(inc)
    return _incident_out(inc)


def log_contact_attempt(
    db: Session, user: User, incident_id: int, data: LoneWorkerContactAttempt
) -> LoneWorkerIncidentResponse:
    """Records that a responder tried to call or message the worker."""
    inc = _owned_incident(db, user, incident_id)
    log_event(
        db,
        company_id=inc.company_id,
        event_type="contact_attempt",
        message=f"{data.method}: {data.outcome or 'no outcome recorded'}",
        session=inc.session,
        incident=inc,
        actor=user,
        channel=data.method,
        recipient=_guard_phone(inc.guard),
        escalation_level=inc.escalation_level,
    )
    db.commit()
    db.refresh(inc)
    return _incident_out(inc)


def resolve_incident(db: Session, user: User, incident_id: int, data: LoneWorkerResolveRequest) -> LoneWorkerIncidentResponse:
    """Close the incident off as safe, incident or emergency. The missed check and every
    escalation stay in the log — resolving never rewrites history."""
    inc = _owned_incident(db, user, incident_id)
    if inc.status == "resolved":
        return _incident_out(inc)
    resolution = (data.resolution or "safe").lower()
    if resolution not in ("safe", "incident", "emergency"):
        raise HTTPException(status_code=422, detail="resolution must be safe, incident or emergency")
    now = _now()
    inc.status = "resolved"
    inc.resolution = resolution
    inc.resolved_at = now
    inc.resolved_by_user_id = user.id
    if data.notes:
        inc.notes = f"{inc.notes}\n{data.notes}" if inc.notes else data.notes

    if resolution == "safe":
        log_event(
            db,
            company_id=inc.company_id,
            event_type="marked_safe",
            message=data.notes or "Worker confirmed safe by responder",
            session=inc.session,
            incident=inc,
            actor=user,
        )
    log_event(
        db,
        company_id=inc.company_id,
        event_type="incident_resolved",
        message=f"Resolved as {resolution}" + (f": {data.notes}" if data.notes else ""),
        session=inc.session,
        incident=inc,
        actor=user,
        escalation_level=inc.escalation_level,
    )

    # The normal check schedule continues once the worker is safe and still on session.
    sess = inc.session
    if sess and sess.status == "active" and resolution == "safe" and not open_check(db, sess.id):
        _schedule_check(db, sess, from_time=now)
    db.commit()
    db.refresh(inc)
    return _incident_out(inc)


# --- Audit report --------------------------------------------------------------------


def _event_out(row: LoneWorkerEvent) -> dict:
    created = _aware(row.created_at)
    return {
        "id": row.id,
        "session_id": row.session_id,
        "incident_id": row.incident_id,
        "guard_id": row.guard_id,
        "guard": row.guard_name or "",
        "site": row.site_name or "",
        "event_type": row.event_type,
        "event_label": event_label(row.event_type),
        "message": row.message or "",
        "escalation_level": row.escalation_level,
        "channel": row.channel or "",
        "recipient": row.recipient or "",
        "user": row.actor_name or "",
        "source": row.source or "",
        "event_date": created.date().isoformat() if created else "",
        "event_time": created.strftime("%H:%M:%S") if created else "",
        "created_at": created.isoformat() if created else "",
    }


def list_events(
    db: Session,
    user: User,
    start_date=None,
    end_date=None,
    session_id: Optional[int] = None,
    incident_id: Optional[int] = None,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    event_type: Optional[str] = None,
    limit: int = 1000,
) -> list[dict]:
    """The permanent lone-worker audit trail, newest first, scoped to the caller's tenant
    and the sites they can already see."""
    from datetime import date as _date, time as _time

    company = get_company_by_user_id(db, user.id)
    q = db.query(LoneWorkerEvent).filter(LoneWorkerEvent.company_id == company.id)

    if isinstance(start_date, _date) and isinstance(end_date, _date):
        if end_date < start_date:
            start_date, end_date = end_date, start_date
        q = q.filter(
            LoneWorkerEvent.created_at >= datetime.combine(start_date, _time.min),
            LoneWorkerEvent.created_at < datetime.combine(end_date + timedelta(days=1), _time.min),
        )
    if session_id:
        q = q.filter(LoneWorkerEvent.session_id == session_id)
    if incident_id:
        q = q.filter(LoneWorkerEvent.incident_id == incident_id)
    if guard_id:
        q = q.filter(LoneWorkerEvent.guard_id == guard_id)
    if site_id:
        q = q.filter(LoneWorkerEvent.site_id == site_id)
    if event_type:
        q = q.filter(LoneWorkerEvent.event_type == event_type)
    if is_staff_portal_user(user):
        q = q.filter(LoneWorkerEvent.guard_id == _resolve_guard(db, user, company.id, None).id)
    q = _scope_sites(db, user, q, LoneWorkerEvent.site_id)

    rows = (
        q.order_by(LoneWorkerEvent.created_at.desc(), LoneWorkerEvent.id.desc())
        .limit(max(1, min(limit, 5000)))
        .all()
    )
    return [_event_out(r) for r in rows]


# --- The clock (arq job) -------------------------------------------------------------


def sweep(db: Session) -> dict:
    """Runs every minute: send reminders, convert unanswered checks into missed checks,
    and walk open incidents up the escalation ladder.

    Everything is derived from ``due_at`` and ``last_escalated_at`` rather than from an
    in-memory timer, so a worker restart or a missed tick self-corrects on the next run.
    """
    now = _now()
    reminders = missed = escalations = 0

    sessions = (
        db.query(LoneWorkerSession)
        .options(joinedload(LoneWorkerSession.guard), joinedload(LoneWorkerSession.site))
        .filter(LoneWorkerSession.status == "active")
        .all()
    )
    for sess in sessions:
        check = open_check(db, sess.id)
        if not check:
            continue
        due = _aware(check.due_at)
        if not due:
            continue

        # Reminder, a few minutes before the check is due.
        reminder_at = due - timedelta(minutes=sess.reminder_minutes or 0)
        if check.reminder_sent_at is None and now >= reminder_at and now < due + timedelta(minutes=sess.grace_minutes or 0):
            check.reminder_sent_at = now
            reminders += 1
            _notify_worker(db, sess, "Safety check call due", f"Your safety check is due at {due.strftime('%H:%M')} UTC. Open the app and confirm you are safe.")
            log_event(
                db,
                company_id=sess.company_id,
                event_type="check_reminder",
                message=f"Reminder sent {sess.reminder_minutes} minutes before the check due at {due.strftime('%H:%M')} UTC",
                session=sess,
                check=check,
                source="system",
            )

        # Grace expired with no response -> missed check, open an incident, escalate.
        if now >= due + timedelta(minutes=sess.grace_minutes or 0):
            check.status = "missed"
            missed += 1
            inc = open_incident(db, sess.id)
            if inc is None:
                inc = LoneWorkerIncident(
                    company_id=sess.company_id,
                    session_id=sess.id,
                    check_id=check.id,
                    guard_id=sess.guard_id,
                    site_id=sess.site_id,
                    kind="missed_check",
                    status="escalating",
                    escalation_level=0,
                    latitude=sess.latitude,
                    longitude=sess.longitude,
                )
                db.add(inc)
                db.flush()
                db.refresh(inc)
            log_event(
                db,
                company_id=sess.company_id,
                event_type="check_missed",
                message=f"No response by {(due + timedelta(minutes=sess.grace_minutes or 0)).strftime('%H:%M')} UTC (grace {sess.grace_minutes} min)",
                session=sess,
                incident=inc,
                check=check,
                source="system",
            )
            escalate(db, inc, actor=None)
            escalations += 1

    # Walk open incidents up the ladder until a responder acknowledges or the top is hit.
    open_incidents = (
        db.query(LoneWorkerIncident)
        .options(joinedload(LoneWorkerIncident.session), joinedload(LoneWorkerIncident.guard), joinedload(LoneWorkerIncident.site))
        .filter(LoneWorkerIncident.status == "escalating")
        .all()
    )
    for inc in open_incidents:
        sess = inc.session
        interval = timedelta(minutes=max((sess.escalation_interval_minutes if sess else 5) or 5, 1))
        last = _aware(inc.last_escalated_at) or _aware(inc.opened_at)
        if last and now - last < interval:
            continue
        if (inc.escalation_level or 0) >= max(max_escalation_level(db, sess), 1):
            continue
        escalate(db, inc, actor=None)
        escalations += 1

    db.commit()
    return {"reminders_sent": reminders, "checks_missed": missed, "escalations": escalations}


def _notify_worker(db: Session, sess: LoneWorkerSession, subject: str, body: str) -> None:
    """Nudge the worker themselves — in-app plus SMS, both best-effort."""
    from app.services import sms_service

    if sess.user_id:
        db.add(
            AppNotification(
                company_id=sess.company_id,
                user_id=sess.user_id,
                kind="lone_worker",
                title=subject,
                body=body[:500],
                entity_type="lone_worker_session",
                entity_id=sess.id,
            )
        )
    phone = _guard_phone(sess.guard)
    if phone and sess.user_id:
        _try_send(db, lambda: sms_service.send_sms(db, sess.user_id, phone, body[:320], "lone_worker_reminder"))
