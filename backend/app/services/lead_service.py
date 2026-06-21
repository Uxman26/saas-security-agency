from __future__ import annotations

import json
import os
import re
import uuid
from datetime import date, datetime, timezone
from typing import Any, List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.auth import SUPER_ADMIN_ROLE
from app.models import (
    DEFAULT_LEAD_STATUSES,
    AppNotification,
    AuditLog,
    Client,
    Lead,
    LeadCommunication,
    LeadConversion,
    LeadCustomStatus,
    LeadDocument,
    LeadFilterPreset,
    LeadFollowUp,
    LeadNote,
    LeadQuotation,
    LeadStatusHistory,
    User,
)
from app.services import audit_service
from app.services.company_service import get_company_by_user_id
from app.services.module_service import is_module_enabled

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")


def _norm_email(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    return v.strip().lower() or None


def _norm_phone(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    digits = re.sub(r"\D", "", v)
    return digits or None


def require_leads_module(db: Session, user_id: int):
    company = get_company_by_user_id(db, user_id)
    if not is_module_enabled(company, "leads"):
        raise HTTPException(status_code=403, detail="Lead management is not enabled")
    return company


def list_statuses(db: Session, user_id: int) -> list[dict]:
    company = require_leads_module(db, user_id)
    custom = (
        db.query(LeadCustomStatus)
        .filter(LeadCustomStatus.company_id == company.id)
        .order_by(LeadCustomStatus.sort_order, LeadCustomStatus.name)
        .all()
    )
    out = [{"name": s, "custom": False} for s in DEFAULT_LEAD_STATUSES]
    for c in custom:
        out.append({"name": c.name, "custom": True, "id": c.id})
    return out


def create_custom_status(db: Session, user_id: int, name: str) -> LeadCustomStatus:
    company = require_leads_module(db, user_id)
    name = name.strip().lower().replace(" ", "_")
    if not name:
        raise HTTPException(status_code=400, detail="Status name required")
    if name in DEFAULT_LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Status already exists")
    existing = (
        db.query(LeadCustomStatus)
        .filter(LeadCustomStatus.company_id == company.id, LeadCustomStatus.name == name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Status already exists")
    row = LeadCustomStatus(company_id=company.id, name=name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def check_duplicate(
    db: Session,
    user_id: int,
    email: Optional[str],
    phone: Optional[str],
    exclude_id: Optional[int] = None,
) -> list[dict]:
    company = require_leads_module(db, user_id)
    ne = _norm_email(email)
    np = _norm_phone(phone)
    dupes: list[dict] = []
    if ne:
        q = db.query(Lead).filter(Lead.company_id == company.id, Lead.email.isnot(None))
        if exclude_id:
            q = q.filter(Lead.id != exclude_id)
        for row in q.all():
            if _norm_email(row.email) == ne:
                dupes.append({"field": "email", "lead_id": row.id, "title": row.title})
    if np:
        q = db.query(Lead).filter(Lead.company_id == company.id, Lead.phone.isnot(None))
        if exclude_id:
            q = q.filter(Lead.id != exclude_id)
        for row in q.all():
            if _norm_phone(row.phone) == np:
                dupes.append({"field": "phone", "lead_id": row.id, "title": row.title})
    return dupes


def _notify(
    db: Session,
    company_id: int,
    user_id: int,
    kind: str,
    title: str,
    body: str = "",
    entity_type: str = "lead",
    entity_id: Optional[int] = None,
) -> None:
    db.add(
        AppNotification(
            company_id=company_id,
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    )


def create_lead(db: Session, user_id: int, data: dict, force_duplicate: bool = False) -> Lead:
    company = require_leads_module(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    dupes = check_duplicate(db, user_id, data.get("email"), data.get("phone"))
    if dupes and not force_duplicate:
        if getattr(user, "role", None) != SUPER_ADMIN_ROLE:
            raise HTTPException(status_code=409, detail={"message": "Duplicate lead detected", "duplicates": dupes})
    lead = Lead(
        company_id=company.id,
        title=(data.get("title") or "").strip(),
        contact_name=data.get("contact_name"),
        email=data.get("email"),
        phone=data.get("phone"),
        address=data.get("address"),
        city=data.get("city"),
        source=data.get("source"),
        status=data.get("status") or "new",
        priority=data.get("priority") or "medium",
        estimated_value=float(data.get("estimated_value") or 0),
        assigned_user_id=data.get("assigned_user_id"),
        created_by=user_id,
    )
    if not lead.title:
        raise HTTPException(status_code=400, detail="Title is required")
    db.add(lead)
    db.flush()
    db.add(LeadStatusHistory(lead_id=lead.id, from_status=None, to_status=lead.status, user_id=user_id))
    audit_service.log_action(db, company_id=company.id, user_id=user_id, action="create", entity_type="lead", entity_id=lead.id)
    if lead.assigned_user_id:
        _notify(db, company.id, lead.assigned_user_id, "lead_assigned", f"Lead assigned: {lead.title}", entity_id=lead.id)
    admins = db.query(User).filter(User.company_id == company.id, User.is_active == True).limit(5).all()
    for u in admins:
        if u.id != user_id:
            _notify(db, company.id, u.id, "lead_new", f"New lead: {lead.title}", entity_id=lead.id)
    db.commit()
    db.refresh(lead)
    return lead


def list_leads(
    db: Session,
    user_id: int,
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
) -> List[Lead]:
    company = require_leads_module(db, user_id)
    q = (
        db.query(Lead)
        .options(joinedload(Lead.assignee), joinedload(Lead.creator))
        .filter(Lead.company_id == company.id)
    )
    if status:
        q = q.filter(Lead.status == status)
    if source:
        q = q.filter(Lead.source == source)
    if assigned_user_id:
        q = q.filter(Lead.assigned_user_id == assigned_user_id)
    if created_by:
        q = q.filter(Lead.created_by == created_by)
    if city:
        q = q.filter(Lead.city.ilike(f"%{city}%"))
    if priority:
        q = q.filter(Lead.priority == priority)
    if converted is not None:
        q = q.filter(Lead.converted == converted)
    if start_date:
        q = q.filter(Lead.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        q = q.filter(Lead.created_at <= datetime.combine(end_date, datetime.max.time()))
    if follow_up_from:
        q = q.filter(Lead.next_follow_up_at >= datetime.combine(follow_up_from, datetime.min.time()))
    if follow_up_to:
        q = q.filter(Lead.next_follow_up_at <= datetime.combine(follow_up_to, datetime.max.time()))
    if search:
        t = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Lead.title.ilike(t),
                Lead.contact_name.ilike(t),
                Lead.email.ilike(t),
                Lead.phone.ilike(t),
                Lead.city.ilike(t),
            )
        )
    return q.order_by(Lead.created_at.desc()).all()


def get_lead(db: Session, user_id: int, lead_id: int) -> Lead:
    company = require_leads_module(db, user_id)
    lead = (
        db.query(Lead)
        .options(
            joinedload(Lead.assignee),
            joinedload(Lead.creator),
            joinedload(Lead.status_history),
            joinedload(Lead.notes),
            joinedload(Lead.follow_ups),
            joinedload(Lead.communications),
            joinedload(Lead.conversions),
            joinedload(Lead.documents),
            joinedload(Lead.quotations),
        )
        .filter(Lead.id == lead_id, Lead.company_id == company.id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


def update_lead(db: Session, user_id: int, lead_id: int, data: dict, force_duplicate: bool = False) -> Lead:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    user = db.query(User).filter(User.id == user_id).first()
    email = data.get("email", lead.email)
    phone = data.get("phone", lead.phone)
    dupes = check_duplicate(db, user_id, email, phone, exclude_id=lead_id)
    if dupes and not force_duplicate and getattr(user, "role", None) != SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=409, detail={"message": "Duplicate lead detected", "duplicates": dupes})
    prev_assignee = lead.assigned_user_id
    for k in (
        "title",
        "contact_name",
        "email",
        "phone",
        "address",
        "city",
        "source",
        "priority",
        "estimated_value",
        "assigned_user_id",
        "next_follow_up_at",
    ):
        if k in data:
            setattr(lead, k, data[k])
    if lead.assigned_user_id and lead.assigned_user_id != prev_assignee:
        _notify(
            db,
            company.id,
            lead.assigned_user_id,
            "lead_assigned",
            f"Lead assigned: {lead.title}",
            entity_id=lead.id,
        )
        audit_service.log_action(
            db,
            company_id=company.id,
            user_id=user_id,
            action="assign",
            entity_type="lead",
            entity_id=lead.id,
            meta={"assigned_user_id": lead.assigned_user_id},
        )
    audit_service.log_action(db, company_id=company.id, user_id=user_id, action="update", entity_type="lead", entity_id=lead.id)
    db.commit()
    db.refresh(lead)
    return lead


def change_status(db: Session, user_id: int, lead_id: int, status: str, note: Optional[str] = None) -> Lead:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    status = status.strip().lower().replace(" ", "_")
    if not status:
        raise HTTPException(status_code=400, detail="Status required")
    prev = lead.status
    if prev == status:
        return lead
    lead.status = status
    db.add(LeadStatusHistory(lead_id=lead.id, from_status=prev, to_status=status, user_id=user_id, note=note))
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="status_change",
        entity_type="lead",
        entity_id=lead.id,
        meta={"from": prev, "to": status},
    )
    if lead.assigned_user_id:
        _notify(
            db,
            company.id,
            lead.assigned_user_id,
            "lead_status",
            f"Lead status: {prev} → {status}",
            entity_id=lead.id,
        )
    db.commit()
    db.refresh(lead)
    return lead


def delete_lead(db: Session, user_id: int, lead_id: int) -> None:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="delete",
        entity_type="lead",
        entity_id=lead.id,
        meta={"title": lead.title},
    )
    db.delete(lead)
    db.commit()


def add_note(db: Session, user_id: int, lead_id: int, body: str) -> LeadNote:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    note = LeadNote(lead_id=lead.id, user_id=user_id, body=body.strip())
    if not note.body:
        raise HTTPException(status_code=400, detail="Note required")
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def add_follow_up(db: Session, user_id: int, lead_id: int, data: dict) -> LeadFollowUp:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    due = data.get("due_at")
    if not due:
        raise HTTPException(status_code=400, detail="Due date required")
    fu = LeadFollowUp(
        lead_id=lead.id,
        company_id=company.id,
        activity_type=data.get("activity_type") or "call",
        title=data.get("title"),
        due_at=due,
        assigned_user_id=data.get("assigned_user_id") or lead.assigned_user_id,
        notes=data.get("notes"),
        created_by=user_id,
    )
    db.add(fu)
    lead.next_follow_up_at = due
    assignee = fu.assigned_user_id or user_id
    _notify(db, company.id, assignee, "follow_up_due", f"Follow-up scheduled: {lead.title}", entity_id=lead.id)
    db.commit()
    db.refresh(fu)
    return fu


def complete_follow_up(db: Session, user_id: int, follow_up_id: int) -> LeadFollowUp:
    company = require_leads_module(db, user_id)
    fu = db.query(LeadFollowUp).filter(LeadFollowUp.id == follow_up_id, LeadFollowUp.company_id == company.id).first()
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    fu.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(fu)
    return fu


def list_follow_ups_calendar(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    assigned_user_id: Optional[int] = None,
) -> List[LeadFollowUp]:
    company = require_leads_module(db, user_id)
    q = (
        db.query(LeadFollowUp)
        .options(joinedload(LeadFollowUp.lead))
        .filter(
            LeadFollowUp.company_id == company.id,
            LeadFollowUp.due_at >= datetime.combine(start_date, datetime.min.time()),
            LeadFollowUp.due_at <= datetime.combine(end_date, datetime.max.time()),
        )
    )
    if assigned_user_id:
        q = q.filter(LeadFollowUp.assigned_user_id == assigned_user_id)
    return q.order_by(LeadFollowUp.due_at).all()


def add_communication(db: Session, user_id: int, lead_id: int, data: dict) -> LeadCommunication:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    comm = LeadCommunication(
        lead_id=lead.id,
        company_id=company.id,
        channel=data.get("channel") or "note",
        subject=data.get("subject"),
        body=data.get("body"),
        attachment_path=data.get("attachment_path"),
        user_id=user_id,
    )
    db.add(comm)
    db.commit()
    db.refresh(comm)
    return comm


def convert_lead(db: Session, user_id: int, lead_id: int, target_type: str, note: Optional[str] = None) -> LeadConversion:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    target_type = target_type.strip().lower()
    target_id: Optional[int] = None
    if target_type == "customer":
        client = Client(
            company_id=company.id,
            name=lead.title,
            email=lead.email,
            phone=lead.phone,
            address=lead.address,
            contact_person=lead.contact_name,
        )
        db.add(client)
        db.flush()
        target_id = client.id
    else:
        raise HTTPException(status_code=400, detail=f"Conversion to {target_type} not supported yet")
    conv = LeadConversion(
        lead_id=lead.id,
        company_id=company.id,
        target_type=target_type,
        target_id=target_id,
        user_id=user_id,
        note=note,
    )
    lead.converted = True
    lead.converted_at = datetime.now(timezone.utc)
    lead.converted_to_type = target_type
    lead.converted_to_id = target_id
    if lead.status != "won":
        prev = lead.status
        lead.status = "won"
        db.add(LeadStatusHistory(lead_id=lead.id, from_status=prev, to_status="won", user_id=user_id, note="Converted"))
    db.add(conv)
    audit_service.log_action(
        db,
        company_id=company.id,
        user_id=user_id,
        action="convert",
        entity_type="lead",
        entity_id=lead.id,
        meta={"target_type": target_type, "target_id": target_id},
    )
    if lead.assigned_user_id:
        _notify(
            db,
            company.id,
            lead.assigned_user_id,
            "lead_converted",
            f"Lead converted to {target_type}",
            entity_id=lead.id,
        )
    db.commit()
    db.refresh(conv)
    return conv


def add_quotation(db: Session, user_id: int, lead_id: int, data: dict) -> LeadQuotation:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    q = LeadQuotation(
        lead_id=lead.id,
        company_id=company.id,
        title=(data.get("title") or "").strip(),
        amount=float(data.get("amount") or 0),
        status=data.get("status") or "draft",
        notes=data.get("notes"),
        created_by=user_id,
    )
    if not q.title:
        raise HTTPException(status_code=400, detail="Title required")
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


async def upload_document(db: Session, user_id: int, lead_id: int, file: UploadFile) -> LeadDocument:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    os.makedirs(os.path.join(UPLOAD_DIR, "leads"), exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    fname = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, "leads", fname)
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)
    doc = LeadDocument(
        lead_id=lead.id,
        company_id=company.id,
        file_name=file.filename or fname,
        file_path=path,
        uploaded_by=user_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def save_filter_preset(db: Session, user_id: int, name: str, filters: dict) -> LeadFilterPreset:
    company = require_leads_module(db, user_id)
    preset = LeadFilterPreset(company_id=company.id, user_id=user_id, name=name.strip(), filters_json=json.dumps(filters))
    if not preset.name:
        raise HTTPException(status_code=400, detail="Preset name required")
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


def list_filter_presets(db: Session, user_id: int) -> List[LeadFilterPreset]:
    company = require_leads_module(db, user_id)
    return (
        db.query(LeadFilterPreset)
        .filter(LeadFilterPreset.company_id == company.id, LeadFilterPreset.user_id == user_id)
        .order_by(LeadFilterPreset.name)
        .all()
    )


def lead_audit_logs(db: Session, user_id: int, lead_id: int) -> List[AuditLog]:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return (
        db.query(AuditLog)
        .filter(AuditLog.company_id == company.id, AuditLog.entity_type == "lead", AuditLog.entity_id == lead_id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )


def list_notifications(db: Session, user_id: int, unread_only: bool = False) -> List[AppNotification]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(AppNotification).filter(AppNotification.company_id == company.id, AppNotification.user_id == user_id)
    if unread_only:
        q = q.filter(AppNotification.read_at.is_(None))
    return q.order_by(AppNotification.created_at.desc()).limit(100).all()


def mark_notification_read(db: Session, user_id: int, notification_id: int) -> AppNotification:
    company = get_company_by_user_id(db, user_id)
    n = (
        db.query(AppNotification)
        .filter(
            AppNotification.id == notification_id,
            AppNotification.company_id == company.id,
            AppNotification.user_id == user_id,
        )
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(n)
    return n


def export_leads_csv(db: Session, user_id: int, **filters) -> str:
    rows = list_leads(db, user_id, **filters)
    lines = ["id,title,contact,email,phone,city,source,status,priority,value,assigned,converted,created"]
    for r in rows:
        lines.append(
            ",".join(
                [
                    str(r.id),
                    f'"{r.title}"',
                    f'"{r.contact_name or ""}"',
                    r.email or "",
                    r.phone or "",
                    f'"{r.city or ""}"',
                    r.source or "",
                    r.status,
                    r.priority or "",
                    str(r.estimated_value or 0),
                    str(r.assigned_user_id or ""),
                    str(r.converted),
                    r.created_at.isoformat() if r.created_at else "",
                ]
            )
        )
    return "\n".join(lines)
