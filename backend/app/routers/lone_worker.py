"""Lone worker / check call endpoints.

Split by audience, which is why the two dependency helpers differ:

* Worker-facing (``/session/*``) uses plain ``require_module`` — the staff portal role has
  to reach these from the mobile app, and every service call re-scopes to the caller's own
  guard record, so a worker can only ever act on their own session.
* Monitoring and configuration uses ``require_internal_module`` — supervisors, controllers
  and admins only, never a portal login.

Mobile and web share these endpoints; ``ClientSourceMiddleware`` records which one made
each call, and that lands on every audit row.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.rbac import require_internal_module, require_module
from app.schemas import (
    LoneWorkerAlarmRequest,
    LoneWorkerCheckIn,
    LoneWorkerContactAttempt,
    LoneWorkerEventResponse,
    LoneWorkerIncidentAction,
    LoneWorkerIncidentResponse,
    LoneWorkerPolicyCreate,
    LoneWorkerPolicyResponse,
    LoneWorkerPolicyUpdate,
    LoneWorkerResolveRequest,
    LoneWorkerSessionEnd,
    LoneWorkerSessionResponse,
    LoneWorkerSessionStart,
)
from app.services import lone_worker_service

router = APIRouter(prefix="/lone-worker", tags=["lone worker"])


# --- Check call rules ----------------------------------------------------------------


@router.get("/policies", response_model=list[LoneWorkerPolicyResponse])
def list_policies(
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "policy_view")),
):
    return lone_worker_service.list_policies(db, current_user, site_id)


@router.post("/policies", response_model=LoneWorkerPolicyResponse, status_code=status.HTTP_201_CREATED)
def create_policy(
    body: LoneWorkerPolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "policy_manage")),
):
    return lone_worker_service.create_policy(db, current_user, body)


@router.patch("/policies/{policy_id}", response_model=LoneWorkerPolicyResponse)
def update_policy(
    policy_id: int,
    body: LoneWorkerPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "policy_manage")),
):
    return lone_worker_service.update_policy(db, current_user, policy_id, body)


@router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "delete")),
):
    lone_worker_service.delete_policy(db, current_user, policy_id)


# --- Worker-facing: the mobile app ---------------------------------------------------


@router.get("/session/current", response_model=Optional[LoneWorkerSessionResponse])
def current_session(
    guard_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("lone_worker", "session_start")),
):
    """The caller's live session, or null when off duty.

    `seconds_to_next_check` and `display_status` are what the app's countdown renders, so
    this is the endpoint to poll while a session is running.
    """
    return lone_worker_service.current_session(db, current_user, guard_id)


@router.post("/session/start", response_model=LoneWorkerSessionResponse, status_code=status.HTTP_201_CREATED)
def start_session(
    body: LoneWorkerSessionStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("lone_worker", "session_start")),
):
    return lone_worker_service.start_session(db, current_user, body)


@router.post("/session/check-in", response_model=LoneWorkerSessionResponse)
def check_in(
    body: LoneWorkerCheckIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("lone_worker", "check_in")),
):
    """I'M SAFE — answers the open check and starts the next check period."""
    return lone_worker_service.check_in(db, current_user, body)


@router.post("/session/alarm", response_model=LoneWorkerIncidentResponse, status_code=status.HTTP_201_CREATED)
def raise_alarm(
    body: LoneWorkerAlarmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("lone_worker", "sos")),
):
    """I NEED ASSISTANCE / SOS — escalates immediately, without waiting for a grace period."""
    return lone_worker_service.raise_alarm(db, current_user, body)


@router.post("/session/end", response_model=LoneWorkerSessionResponse)
def end_session(
    body: LoneWorkerSessionEnd,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("lone_worker", "session_start")),
):
    """END LONE WORKING. Refused with 409 while an incident is still open."""
    return lone_worker_service.end_session(db, current_user, body)


# --- Monitoring: controller / supervisor ---------------------------------------------


@router.get("/sessions", response_model=list[LoneWorkerSessionResponse])
def list_sessions(
    status_filter: str = "active",
    site_id: Optional[int] = None,
    guard_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "monitor")),
):
    """The live board. `status_filter=all` includes completed sessions."""
    return lone_worker_service.list_sessions(db, current_user, status_filter, site_id, guard_id, limit)


@router.get("/incidents", response_model=list[LoneWorkerIncidentResponse])
def list_incidents(
    status_filter: Optional[str] = None,
    kind: Optional[str] = None,
    site_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "monitor")),
):
    """`status_filter=open` returns everything still escalating or acknowledged."""
    return lone_worker_service.list_incidents(
        db, current_user, status=status_filter, kind=kind, site_id=site_id, limit=limit
    )


@router.post("/incidents/{incident_id}/acknowledge", response_model=LoneWorkerIncidentResponse)
def acknowledge(
    incident_id: int,
    body: LoneWorkerIncidentAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "respond")),
):
    """Stops the escalation ladder. Deliberately does not close the incident."""
    return lone_worker_service.acknowledge_incident(db, current_user, incident_id, body.notes)


@router.post("/incidents/{incident_id}/escalate", response_model=LoneWorkerIncidentResponse)
def escalate(
    incident_id: int,
    body: LoneWorkerIncidentAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "respond")),
):
    return lone_worker_service.escalate_incident(db, current_user, incident_id, body.notes)


@router.post("/incidents/{incident_id}/contact-attempt", response_model=LoneWorkerIncidentResponse)
def contact_attempt(
    incident_id: int,
    body: LoneWorkerContactAttempt,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "respond")),
):
    """Log that the responder tried to call or message the worker."""
    return lone_worker_service.log_contact_attempt(db, current_user, incident_id, body)


@router.post("/incidents/{incident_id}/resolve", response_model=LoneWorkerIncidentResponse)
def resolve(
    incident_id: int,
    body: LoneWorkerResolveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "resolve")),
):
    """Close off as safe, incident or emergency. History is never rewritten."""
    return lone_worker_service.resolve_incident(db, current_user, incident_id, body)


# --- Audit trail ---------------------------------------------------------------------


@router.get("/events", response_model=list[LoneWorkerEventResponse])
def list_events(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    session_id: Optional[int] = None,
    incident_id: Optional[int] = None,
    guard_id: Optional[int] = None,
    site_id: Optional[int] = None,
    event_type: Optional[str] = None,
    limit: int = 1000,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_internal_module("lone_worker", "audit_view")),
):
    """Permanent record of session start/end, check-ins, misses, reminders, escalation
    notifications, acknowledgements, contact attempts and final resolution.

    Read-only by design — no endpoint edits or deletes these rows. Pass the same date for
    `start_date` and `end_date` to filter a single day.
    """
    return lone_worker_service.list_events(
        db,
        current_user,
        start_date=start_date,
        end_date=end_date,
        session_id=session_id,
        incident_id=incident_id,
        guard_id=guard_id,
        site_id=site_id,
        event_type=event_type,
        limit=limit,
    )


@router.get("/event-types")
def event_types(
    current_user: User = Depends(require_internal_module("lone_worker", "audit_view")),
):
    return [{"value": k, "label": v} for k, v in lone_worker_service.EVENT_LABELS.items()]
