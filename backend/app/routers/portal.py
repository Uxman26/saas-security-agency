import os
import uuid
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MobileAnnouncement, MobileDeviceToken, User
from app.rbac import require_module
from app.schemas import (
    BookingOnOff,
    ClientResponse,
    GuardResponse,
    IncidentCreate,
    IncidentResponse,
    MessageResponse,
    PatrolComplianceRow,
    PatrolTodayResponse,
    PortalAnnouncementResponse,
    PortalHoursResponse,
    PortalMessageCreateRequest,
    PortalNotificationResponse,
    PortalPushTokenRequest,
    PortalThreadCreateRequest,
    RotaDetailResponse,
    SiteResponse,
)
from app.services import attendance_service, incident_service, lead_service, patrol_service, portal_messaging_service, portal_service
from app.services.company_service import get_company_by_user_id
from app.services.image_avif_service import is_image_filename, save_upload_as_avif
from app.storage_paths import INCIDENT_PHOTOS_DIR, ensure_upload_dirs

router = APIRouter(prefix="/portal", tags=["portal"])


def _portal_notification_out(n) -> PortalNotificationResponse:
    return PortalNotificationResponse(
        id=n.id,
        title=n.title,
        body=n.body,
        type=n.kind,
        kind=n.kind,
        read=n.read_at is not None,
        read_at=n.read_at,
        created_at=n.created_at,
        data={
            "entity_type": n.entity_type,
            "entity_id": n.entity_id,
        },
        entity_type=n.entity_type,
        entity_id=n.entity_id,
    )


@router.get("/me/profile", response_model=GuardResponse)
def portal_staff_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    """The authenticated staff member's own employee record for the mobile profile screen."""
    return portal_service.portal_staff_profile(db, current_user)


@router.get("/me/photo")
def portal_staff_photo(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    path = portal_service.portal_staff_photo_path(db, current_user)
    return FileResponse(path)


@router.get("/me/client-profile", response_model=ClientResponse)
def portal_client_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    """The authenticated client login's linked client record."""
    return portal_service.portal_client_profile(db, current_user)


@router.get("/sites", response_model=list[SiteResponse])
def portal_sites(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    return portal_service.list_portal_sites(db, current_user)


@router.get("/rota/current", response_model=list[RotaDetailResponse])
def portal_rota_current(
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "rota_current")),
):
    return portal_service.list_portal_rota(db, current_user, "current", site_id=site_id)


@router.get("/rota/upcoming", response_model=list[RotaDetailResponse])
def portal_rota_upcoming(
    end_date: Optional[date] = None,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "rota_upcoming")),
):
    return portal_service.list_portal_rota(
        db, current_user, "upcoming", end_date=end_date, site_id=site_id
    )


@router.get("/rota/previous", response_model=list[RotaDetailResponse])
def portal_rota_previous(
    start_date: Optional[date] = None,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "rota_previous")),
):
    return portal_service.list_portal_rota(
        db, current_user, "previous", start_date=start_date, site_id=site_id
    )


@router.get("/hours", response_model=PortalHoursResponse)
def portal_hours(
    period: str = "week",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "hours_view")),
):
    return portal_service.portal_hours(db, current_user, period, start_date, end_date, site_id=site_id)


@router.get("/patrol/today", response_model=PatrolTodayResponse)
def portal_patrol_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "patrol_today")),
):
    return patrol_service.today_for_guard(db, current_user)


@router.get("/patrol/compliance", response_model=list[PatrolComplianceRow])
def portal_patrol_compliance(
    start_date: date,
    end_date: date,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "patrol_compliance")),
):
    return patrol_service.compliance_report(db, current_user, start_date, end_date, site_id)


@router.get("/incidents", response_model=list[IncidentResponse])
def portal_incidents(
    status: Optional[str] = None,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "incidents_view")),
):
    if site_id is not None:
        from app.services.portal_access import assert_site_visible

        assert_site_visible(db, current_user, site_id)
    return incident_service.list_incidents(db, current_user, status=status, site_id=site_id)


@router.post("/incidents", response_model=IncidentResponse, status_code=201)
def portal_create_incident(
    body: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "incidents_create")),
):
    return incident_service.create_incident(db, current_user, body)


@router.post("/incidents/with-images", response_model=IncidentResponse, status_code=201)
async def portal_create_incident_with_images(
    notes: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    accuracy: Optional[float] = Form(None),
    occurred_at: Optional[str] = Form(None),
    site_id: Optional[int] = Form(None),
    assignment_id: Optional[int] = Form(None),
    images: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "incidents_create")),
):
    occurred = None
    if occurred_at:
        try:
            occurred = datetime.fromisoformat(occurred_at.replace("Z", "+00:00"))
        except ValueError:
            occurred = None
    attachments: list[tuple[str, Optional[str]]] = []
    ensure_upload_dirs()
    for img in images or []:
        if not img.filename or not is_image_filename(img.filename):
            continue
        base = os.path.join(INCIDENT_PHOTOS_DIR, f"{uuid.uuid4().hex}")
        dest, mime = save_upload_as_avif(img.file, base)
        attachments.append((dest, mime))
    body = IncidentCreate(
        notes=notes,
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        occurred_at=occurred,
        site_id=site_id,
        assignment_id=assignment_id,
    )
    return incident_service.create_incident(db, current_user, body, attachment_paths=attachments)


@router.get("/notifications", response_model=list[PortalNotificationResponse])
def portal_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    """In-app inbox for portal/mobile users (rota changes, patrol reminders, etc.)."""
    rows = lead_service.list_notifications(db, current_user.id, unread_only)
    return [_portal_notification_out(n) for n in rows]


@router.post("/notifications/{notification_id}/read", response_model=PortalNotificationResponse)
def portal_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    n = lead_service.mark_notification_read(db, current_user.id, notification_id)
    return _portal_notification_out(n)


@router.post("/devices/push-token", response_model=MessageResponse)
def portal_register_push_token(
    body: PortalPushTokenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    """Register / refresh an FCM device token for this portal user.

    Tokens are never reassigned across users: if another account already owns
    this FCM token (or this device_id), that row is cleared/updated only for the
    current user so push delivery cannot be hijacked by login on a shared device.
    """
    company = get_company_by_user_id(db, current_user.id)
    platform = (body.platform or "android").strip().lower()
    if platform not in {"android", "ios", "web"}:
        raise HTTPException(status_code=400, detail="platform must be android, ios, or web")
    token = body.fcm_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="fcm_token is required")
    now = datetime.now(timezone.utc)

    # Drop stale rows where this exact token belonged to someone else in the tenant.
    (
        db.query(MobileDeviceToken)
        .filter(
            MobileDeviceToken.company_id == company.id,
            MobileDeviceToken.fcm_token == token,
            MobileDeviceToken.user_id != current_user.id,
        )
        .delete(synchronize_session=False)
    )

    row = None
    if body.device_id:
        # Prefer updating this user's same physical device.
        row = (
            db.query(MobileDeviceToken)
            .filter(
                MobileDeviceToken.company_id == company.id,
                MobileDeviceToken.user_id == current_user.id,
                MobileDeviceToken.device_id == body.device_id,
            )
            .first()
        )
        # Another user on the same device_id must not keep receiving this device's pushes.
        (
            db.query(MobileDeviceToken)
            .filter(
                MobileDeviceToken.company_id == company.id,
                MobileDeviceToken.device_id == body.device_id,
                MobileDeviceToken.user_id != current_user.id,
            )
            .delete(synchronize_session=False)
        )
    if row is None:
        row = (
            db.query(MobileDeviceToken)
            .filter(
                MobileDeviceToken.company_id == company.id,
                MobileDeviceToken.user_id == current_user.id,
                MobileDeviceToken.fcm_token == token,
            )
            .first()
        )
    if row is None:
        row = MobileDeviceToken(
            company_id=company.id,
            user_id=current_user.id,
            fcm_token=token,
            platform=platform,
            device_id=body.device_id,
        )
        db.add(row)
    else:
        row.fcm_token = token
        row.platform = platform
        if body.device_id:
            row.device_id = body.device_id
        row.updated_at = now
    db.commit()
    return {"message": "Push token registered."}


@router.get("/announcements/active", response_model=PortalAnnouncementResponse)
def portal_active_announcement(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    """Active splash announcement for mobile (company-scoped, then global)."""
    company = get_company_by_user_id(db, current_user.id)
    now = datetime.now(timezone.utc)
    q = (
        db.query(MobileAnnouncement)
        .filter(MobileAnnouncement.status == "active")
        .filter(
            (MobileAnnouncement.company_id == company.id) | (MobileAnnouncement.company_id.is_(None))
        )
    )
    rows = q.order_by(MobileAnnouncement.priority.desc(), MobileAnnouncement.id.desc()).all()
    for row in rows:
        if row.starts_at and row.starts_at > now:
            continue
        if row.ends_at and row.ends_at < now:
            continue
        return PortalAnnouncementResponse(
            active=True,
            announcement={
                "id": str(row.id),
                "title": row.title,
                "message": row.message,
                "media_type": row.media_type or "message",
                "image_url": row.image_url,
                "video_url": row.video_url,
                "cta_label": row.cta_label or "Got it",
                "dismissible": bool(row.dismissible),
                "priority": row.priority or 0,
                "starts_at": row.starts_at.isoformat() if row.starts_at else None,
                "ends_at": row.ends_at.isoformat() if row.ends_at else None,
            },
        )
    return PortalAnnouncementResponse(active=False, announcement=None)


@router.post("/attendance/clock-in")
def portal_clock_in(
    body: BookingOnOff,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("attendance", "book")),
):
    """Mobile clock-in with optional GPS (same rules as POST /attendance/book)."""
    payload = body.model_copy(update={"book_off": False})
    return attendance_service.book_on_off(db, payload, current_user.id)


@router.post("/attendance/clock-out")
def portal_clock_out(
    body: BookingOnOff,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("attendance", "book")),
):
    """Mobile clock-out with optional GPS (same rules as POST /attendance/book)."""
    payload = body.model_copy(update={"book_off": True})
    return attendance_service.book_on_off(db, payload, current_user.id)


@router.get("/messages/threads")
def portal_message_threads(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    return portal_messaging_service.list_threads(db, current_user)


@router.post("/messages/threads", status_code=201)
def portal_create_thread(
    body: PortalThreadCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    return portal_messaging_service.get_or_create_thread(db, current_user, body.peer_id)


@router.get("/messages/threads/{thread_id}")
def portal_get_thread(
    thread_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    return portal_messaging_service.get_thread(db, current_user, thread_id)


@router.post("/messages/threads/{thread_id}")
def portal_post_message(
    thread_id: str,
    body: PortalMessageCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    return portal_messaging_service.post_message(
        db, current_user, thread_id, body.body, body.client_message_id
    )


@router.post("/messages/threads/{thread_id}/read")
def portal_mark_thread_read(
    thread_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module("my_portal", "view")),
):
    return portal_messaging_service.mark_thread_read(db, current_user, thread_id)
