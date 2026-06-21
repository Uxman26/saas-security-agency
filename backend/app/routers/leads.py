from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lead, LeadDocument, User
from app.rbac import PERM_LEADS_ASSIGN, PERM_LEADS_DELETE, PERM_LEADS_EXPORT, PERM_LEADS_READ, PERM_LEADS_REPORTS, PERM_LEADS_WRITE, require_perm
from app.schemas import (
    AppNotificationResponse,
    LeadCommunicationCreate,
    LeadCommunicationResponse,
    LeadConvertRequest,
    LeadConversionResponse,
    LeadCreate,
    LeadCustomStatusCreate,
    LeadDuplicateCheck,
    LeadFilterPresetCreate,
    LeadFollowUpCreate,
    LeadFollowUpResponse,
    LeadNoteCreate,
    LeadNoteResponse,
    LeadQuotationCreate,
    LeadResponse,
    LeadStatusChange,
    LeadUpdate,
    PushSubscribeRequest,
)
from app.services import lead_report_service, lead_service

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("/statuses")
def list_statuses(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    return lead_service.list_statuses(db, current_user.id)


@router.post("/statuses")
def create_status(body: LeadCustomStatusCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    row = lead_service.create_custom_status(db, current_user.id, body.name)
    return {"name": row.name, "custom": True, "id": row.id}


@router.get("/dashboard")
def dashboard(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_LEADS_REPORTS)),
):
    return lead_report_service.lead_dashboard(db, current_user.id, start_date, end_date)


@router.post("/check-duplicate")
def check_duplicate(body: LeadDuplicateCheck, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    return lead_service.check_duplicate(db, current_user.id, body.email, body.phone, body.exclude_id)


@router.get("/filter-presets")
def list_presets(db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    rows = lead_service.list_filter_presets(db, current_user.id)
    return [{"id": r.id, "name": r.name, "filters": __import__("json").loads(r.filters_json)} for r in rows]


@router.post("/filter-presets")
def save_preset(body: LeadFilterPresetCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    row = lead_service.save_filter_preset(db, current_user.id, body.name, body.filters)
    return {"id": row.id, "name": row.name}


@router.delete("/filter-presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preset(preset_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    lead_service.delete_filter_preset(db, current_user.id, preset_id)
    return None


@router.post("/push/subscribe")
def push_subscribe(body: PushSubscribeRequest, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    lead_service.save_push_subscription(db, current_user.id, body.endpoint, body.p256dh, body.auth)
    return {"ok": True}


@router.get("/follow-ups/calendar", response_model=list[LeadFollowUpResponse])
def follow_up_calendar(
    start_date: date,
    end_date: date,
    assigned_user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_LEADS_READ)),
):
    return lead_service.list_follow_ups_calendar(db, current_user.id, start_date, end_date, assigned_user_id)


@router.get("/export")
def export_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_user_id: Optional[int] = None,
    city: Optional[str] = None,
    priority: Optional[str] = None,
    converted: Optional[bool] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_LEADS_EXPORT)),
):
    csv = lead_service.export_leads_csv(
        db,
        current_user.id,
        status=status,
        source=source,
        assigned_user_id=assigned_user_id,
        city=city,
        priority=priority,
        converted=converted,
        search=search,
    )
    return Response(content=csv, media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="leads.csv"'})


@router.get("/notifications", response_model=list[AppNotificationResponse])
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_LEADS_READ)),
):
    return lead_service.list_notifications(db, current_user.id, unread_only)


@router.post("/notifications/{notification_id}/read", response_model=AppNotificationResponse)
def read_notification(notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    return lead_service.mark_notification_read(db, current_user.id, notification_id)


@router.get("", response_model=list[LeadResponse])
def list_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_user_id: Optional[int] = None,
    created_by: Optional[int] = None,
    city: Optional[str] = None,
    priority: Optional[str] = None,
    converted: Optional[bool] = None,
    follow_up_from: Optional[date] = None,
    follow_up_to: Optional[date] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm(PERM_LEADS_READ)),
):
    return lead_service.list_leads(
        db,
        current_user.id,
        status=status,
        source=source,
        assigned_user_id=assigned_user_id,
        created_by=created_by,
        city=city,
        priority=priority,
        converted=converted,
        follow_up_from=follow_up_from,
        follow_up_to=follow_up_to,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
def create_lead(body: LeadCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return lead_service.create_lead(db, current_user.id, body.model_dump(), force_duplicate=bool(body.force_duplicate))


@router.get("/{lead_id}/detail")
def lead_detail(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    d = lead_service.get_lead_detail(db, current_user.id, lead_id)
    lead = d["lead"]

    def _iso(dt):
        return dt.isoformat() if dt else None

    return {
        "lead": LeadResponse.model_validate(lead),
        "notes": [{"id": n.id, "body": n.body, "user_id": n.user_id, "created_at": _iso(n.created_at)} for n in d["notes"]],
        "communications": [
            {"id": c.id, "channel": c.channel, "subject": c.subject, "body": c.body, "user_id": c.user_id, "created_at": _iso(c.created_at)}
            for c in d["communications"]
        ],
        "follow_ups": [
            {
                "id": f.id,
                "activity_type": f.activity_type,
                "title": f.title,
                "due_at": _iso(f.due_at),
                "completed_at": _iso(f.completed_at),
                "notes": f.notes,
            }
            for f in d["follow_ups"]
        ],
        "documents": [{"id": doc.id, "file_name": doc.file_name, "created_at": _iso(doc.created_at)} for doc in d["documents"]],
        "quotations": [
            {"id": q.id, "title": q.title, "amount": q.amount, "status": q.status, "notes": q.notes, "created_at": _iso(q.created_at)}
            for q in d["quotations"]
        ],
        "status_history": [
            {"id": h.id, "from_status": h.from_status, "to_status": h.to_status, "note": h.note, "created_at": _iso(h.created_at)}
            for h in d["status_history"]
        ],
        "conversions": [
            {"id": c.id, "target_type": c.target_type, "target_id": c.target_id, "note": c.note, "created_at": _iso(c.created_at)}
            for c in d["conversions"]
        ],
    }


@router.get("/{lead_id}/documents/{doc_id}/file")
def download_document(lead_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    company = lead_service.require_leads_module(db, current_user.id)
    doc = (
        db.query(LeadDocument)
        .join(Lead)
        .filter(LeadDocument.id == doc_id, LeadDocument.lead_id == lead_id, Lead.company_id == company.id)
        .first()
    )
    if not doc:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Document not found")
    import os
    if not os.path.isfile(doc.file_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(doc.file_path, filename=doc.file_name)


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    return lead_service.get_lead(db, current_user.id, lead_id)


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(lead_id: int, body: LeadUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    data = {k: v for k, v in body.model_dump().items() if v is not None or k == "assigned_user_id"}
    return lead_service.update_lead(db, current_user.id, lead_id, data, force_duplicate=bool(body.force_duplicate))


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_DELETE))):
    lead_service.delete_lead(db, current_user.id, lead_id)
    return None


@router.post("/{lead_id}/status", response_model=LeadResponse)
def change_status(lead_id: int, body: LeadStatusChange, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return lead_service.change_status(db, current_user.id, lead_id, body.status, body.note)


@router.post("/{lead_id}/assign", response_model=LeadResponse)
def assign_lead(lead_id: int, assigned_user_id: int = Query(...), db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_ASSIGN))):
    return lead_service.update_lead(db, current_user.id, lead_id, {"assigned_user_id": assigned_user_id})


@router.get("/{lead_id}/audit")
def lead_audit(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_READ))):
    rows = lead_service.lead_audit_logs(db, current_user.id, lead_id)
    return [
        {
            "id": r.id,
            "action": r.action,
            "user_id": r.user_id,
            "meta": __import__("json").loads(r.meta) if r.meta else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/{lead_id}/notes", response_model=LeadNoteResponse)
def add_note(lead_id: int, body: LeadNoteCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return lead_service.add_note(db, current_user.id, lead_id, body.body)


@router.post("/{lead_id}/follow-ups", response_model=LeadFollowUpResponse)
def add_follow_up(lead_id: int, body: LeadFollowUpCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return lead_service.add_follow_up(db, current_user.id, lead_id, body.model_dump())


@router.post("/follow-ups/{follow_up_id}/complete", response_model=LeadFollowUpResponse)
def complete_follow_up(follow_up_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return lead_service.complete_follow_up(db, current_user.id, follow_up_id)


@router.post("/{lead_id}/communications", response_model=LeadCommunicationResponse)
def add_communication(lead_id: int, body: LeadCommunicationCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return lead_service.add_communication(db, current_user.id, lead_id, body.model_dump())


@router.post("/{lead_id}/convert", response_model=LeadConversionResponse)
def convert_lead(lead_id: int, body: LeadConvertRequest, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return lead_service.convert_lead(db, current_user.id, lead_id, body.target_type, body.note)


@router.post("/{lead_id}/quotations")
def add_quotation(lead_id: int, body: LeadQuotationCreate, db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return lead_service.add_quotation(db, current_user.id, lead_id, body.model_dump())


@router.post("/{lead_id}/documents")
async def upload_document(lead_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(require_perm(PERM_LEADS_WRITE))):
    return await lead_service.upload_document(db, current_user.id, lead_id, file)
