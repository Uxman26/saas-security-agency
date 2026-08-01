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
from app.authz import assert_owned_by_company
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
    PushSubscription,
    SalesContract,
    SalesOpportunity,
    SalesProject,
    User,
)
from app.schemas import InvoiceCreate
from app.services import audit_service, invoice_service
from app.services.lead_email_service import email_for_lead_event
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
    email_secondary: Optional[str] = None,
    phone_secondary: Optional[str] = None,
) -> list[dict]:
    company = require_leads_module(db, user_id)
    emails = {_norm_email(email), _norm_email(email_secondary)} - {None}
    phones = {_norm_phone(phone), _norm_phone(phone_secondary)} - {None}
    if not emails and not phones:
        return []
    dupes: list[dict] = []
    q = db.query(Lead).filter(Lead.company_id == company.id)
    if exclude_id:
        q = q.filter(Lead.id != exclude_id)
    seen: set[tuple[str, int]] = set()
    for row in q.all():
        row_emails = {_norm_email(row.email), _norm_email(row.email_secondary)} - {None}
        row_phones = {_norm_phone(row.phone), _norm_phone(row.phone_secondary)} - {None}
        if emails & row_emails:
            key = ("email", row.id)
            if key not in seen:
                seen.add(key)
                dupes.append({"field": "email", "lead_id": row.id, "title": row.title})
        if phones & row_phones:
            key = ("phone", row.id)
            if key not in seen:
                seen.add(key)
                dupes.append({"field": "phone", "lead_id": row.id, "title": row.title})
    return dupes


def _lead_title(data: dict) -> str:
    org = (data.get("organization") or "").strip()
    title = (data.get("title") or "").strip()
    return org or title


def _assert_assignee_in_company(db: Session, assigned_user_id, company_id: int) -> None:
    """An assignee must be a colleague.

    Assigning to a user in another company would post a notification containing this
    lead's title into that company's feed.
    """
    assert_owned_by_company(db, User, assigned_user_id, company_id, field_name="assigned_user_id")


def _notify(
    db: Session,
    company_id: int,
    user_id: int,
    kind: str,
    title: str,
    body: str = "",
    entity_type: str = "lead",
    entity_id: Optional[int] = None,
    lead: Optional[Lead] = None,
    actor_id: Optional[int] = None,
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
    if lead and actor_id:
        email_for_lead_event(db, actor_id, lead, kind, body or title, user_id)


def create_lead(db: Session, user_id: int, data: dict, force_duplicate: bool = False) -> Lead:
    company = require_leads_module(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    dupes = check_duplicate(
        db,
        user_id,
        data.get("email"),
        data.get("phone"),
        email_secondary=data.get("email_secondary"),
        phone_secondary=data.get("phone_secondary"),
    )
    if dupes and not force_duplicate:
        if getattr(user, "role", None) != SUPER_ADMIN_ROLE:
            raise HTTPException(status_code=409, detail={"message": "Duplicate lead detected", "duplicates": dupes})
    title = _lead_title(data)
    status = data.get("status") or "new"
    _assert_assignee_in_company(db, data.get("assigned_user_id"), company.id)
    lead = Lead(
        company_id=company.id,
        title=title,
        organization=data.get("organization") or title,
        contact_name=data.get("contact_name"),
        designation=data.get("designation"),
        email=data.get("email"),
        email_secondary=data.get("email_secondary"),
        phone=data.get("phone"),
        phone_secondary=data.get("phone_secondary"),
        address=data.get("address"),
        city=data.get("city"),
        postcode=data.get("postcode"),
        comments=data.get("comments"),
        source=data.get("source"),
        status=status,
        priority=data.get("priority") or "moderate",
        estimated_value=float(data.get("estimated_value") or 0),
        assigned_user_id=data.get("assigned_user_id"),
        next_follow_up_at=data.get("next_follow_up_at"),
        meeting_at=data.get("meeting_at"),
        created_by=user_id,
    )
    if not lead.title:
        raise HTTPException(status_code=400, detail="Organization is required")
    db.add(lead)
    db.flush()
    db.add(LeadStatusHistory(lead_id=lead.id, from_status=None, to_status=lead.status, user_id=user_id))
    if lead.comments and lead.comments.strip():
        db.add(LeadNote(lead_id=lead.id, user_id=user_id, body=lead.comments.strip()))
    audit_service.log_action(db, company_id=company.id, user_id=user_id, action="create", entity_type="lead", entity_id=lead.id)
    if lead.assigned_user_id:
        _notify(db, company.id, lead.assigned_user_id, "lead_assigned", f"Lead assigned: {lead.title}", entity_id=lead.id, lead=lead, actor_id=user_id)
    admins = db.query(User).filter(User.company_id == company.id, User.is_active == True).limit(5).all()
    for u in admins:
        if u.id != user_id:
            _notify(db, company.id, u.id, "lead_new", f"New lead: {lead.title}", entity_id=lead.id, lead=lead, actor_id=user_id)
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
    has_follow_up: Optional[bool] = None,
    today_follow_ups: Optional[bool] = None,
    upcoming_follow_ups: Optional[bool] = None,
    meetings_only: Optional[bool] = None,
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
    if has_follow_up:
        q = q.filter(Lead.next_follow_up_at.isnot(None))
    if today_follow_ups:
        today = date.today()
        q = q.filter(
            Lead.next_follow_up_at >= datetime.combine(today, datetime.min.time()),
            Lead.next_follow_up_at <= datetime.combine(today, datetime.max.time()),
        )
    if upcoming_follow_ups:
        now = datetime.now(timezone.utc)
        q = q.filter(Lead.next_follow_up_at >= now)
    if meetings_only:
        q = q.filter(or_(Lead.status == "meeting", Lead.meeting_at.isnot(None)))
    if search:
        t = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Lead.title.ilike(t),
                Lead.organization.ilike(t),
                Lead.contact_name.ilike(t),
                Lead.email.ilike(t),
                Lead.email_secondary.ilike(t),
                Lead.phone.ilike(t),
                Lead.phone_secondary.ilike(t),
                Lead.city.ilike(t),
                Lead.postcode.ilike(t),
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
    dupes = check_duplicate(
        db,
        user_id,
        email,
        phone,
        exclude_id=lead_id,
        email_secondary=data.get("email_secondary", lead.email_secondary),
        phone_secondary=data.get("phone_secondary", lead.phone_secondary),
    )
    if dupes and not force_duplicate and getattr(user, "role", None) != SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=409, detail={"message": "Duplicate lead detected", "duplicates": dupes})
    prev_assignee = lead.assigned_user_id
    prev_status = lead.status
    if "assigned_user_id" in data:
        _assert_assignee_in_company(db, data["assigned_user_id"], lead.company_id)
    if "organization" in data or "title" in data:
        title = _lead_title({**data, "organization": data.get("organization", lead.organization), "title": data.get("title", lead.title)})
        if title:
            lead.title = title
            lead.organization = data.get("organization", lead.organization) or title
    for k in (
        "organization",
        "contact_name",
        "designation",
        "email",
        "email_secondary",
        "phone",
        "phone_secondary",
        "address",
        "city",
        "postcode",
        "comments",
        "source",
        "status",
        "priority",
        "estimated_value",
        "assigned_user_id",
        "next_follow_up_at",
        "meeting_at",
    ):
        if k in data:
            setattr(lead, k, data[k])
    if "status" in data and data["status"] != prev_status:
        db.add(
            LeadStatusHistory(
                lead_id=lead.id,
                from_status=prev_status,
                to_status=data["status"],
                user_id=user_id,
            )
        )
    if lead.assigned_user_id and lead.assigned_user_id != prev_assignee:
        _notify(
            db,
            company.id,
            lead.assigned_user_id,
            "lead_assigned",
            f"Lead assigned: {lead.title}",
            entity_id=lead.id,
            lead=lead,
            actor_id=user_id,
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
            lead=lead,
            actor_id=user_id,
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
    _assert_assignee_in_company(db, data.get("assigned_user_id"), company.id)
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
    _notify(db, company.id, assignee, "follow_up_due", f"Follow-up scheduled: {lead.title}", entity_id=lead.id, lead=lead, actor_id=user_id)
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


def _client_from_lead(db: Session, company_id: int, lead: Lead) -> Client:
    if lead.converted_to_type == "customer" and lead.converted_to_id:
        existing = db.query(Client).filter(Client.id == lead.converted_to_id, Client.company_id == company_id).first()
        if existing:
            return existing
    client = Client(
        company_id=company_id,
        name=lead.title,
        email=lead.email,
        phone=lead.phone,
        address=lead.address,
        contact_person=lead.contact_name,
    )
    db.add(client)
    db.flush()
    return client


def convert_lead(db: Session, user_id: int, lead_id: int, target_type: str, note: Optional[str] = None) -> LeadConversion:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    target_type = target_type.strip().lower()
    target_id: Optional[int] = None
    today = date.today()

    if target_type in ("customer", "client"):
        target_type = "customer"
        if lead.converted_to_type == "customer" and lead.converted_to_id:
            target_id = lead.converted_to_id
        else:
            client = _client_from_lead(db, company.id, lead)
            target_id = client.id
            lead.converted = True
            lead.converted_to_type = "customer"
            lead.converted_to_id = target_id
            lead.converted_at = datetime.now(timezone.utc)
    elif target_type == "opportunity":
        client_id = lead.converted_to_id if lead.converted_to_type == "customer" else None
        opp = SalesOpportunity(
            company_id=company.id,
            lead_id=lead.id,
            client_id=client_id,
            title=lead.title,
            value=float(lead.estimated_value or 0),
            status="open",
            notes=note,
            created_by=user_id,
        )
        db.add(opp)
        db.flush()
        target_id = opp.id
    elif target_type == "project":
        client_id = lead.converted_to_id if lead.converted_to_type == "customer" else None
        proj = SalesProject(
            company_id=company.id,
            lead_id=lead.id,
            client_id=client_id,
            title=lead.title,
            value=float(lead.estimated_value or 0),
            status="planned",
            start_date=today,
            created_by=user_id,
        )
        db.add(proj)
        db.flush()
        target_id = proj.id
    elif target_type == "contract":
        client = _client_from_lead(db, company.id, lead)
        contract = SalesContract(
            company_id=company.id,
            lead_id=lead.id,
            client_id=client.id,
            title=f"Contract — {lead.title}",
            value=float(lead.estimated_value or 0),
            status="draft",
            start_date=today,
            created_by=user_id,
        )
        db.add(contract)
        db.flush()
        target_id = contract.id
    elif target_type == "invoice":
        client = _client_from_lead(db, company.id, lead)
        inv = invoice_service.create_invoice(
            db,
            InvoiceCreate(
                client_id=client.id,
                period_start=today,
                period_end=today,
                total=float(lead.estimated_value or 0),
                subtotal=float(lead.estimated_value or 0),
                status="draft",
                notes=note or f"Converted from lead #{lead.id}",
            ),
            user_id,
        )
        target_id = inv.id
        lead.converted = True
        lead.converted_to_type = "invoice"
        lead.converted_to_id = target_id
        lead.converted_at = datetime.now(timezone.utc)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown conversion type: {target_type}")

    conv = LeadConversion(
        lead_id=lead.id,
        company_id=company.id,
        target_type=target_type,
        target_id=target_id,
        user_id=user_id,
        note=note,
    )
    if lead.status != "won" and target_type in ("customer", "invoice"):
        prev = lead.status
        lead.status = "won"
        db.add(LeadStatusHistory(lead_id=lead.id, from_status=prev, to_status="won", user_id=user_id, note=f"Converted to {target_type}"))
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
    notify_ids = {lead.assigned_user_id, user_id} - {None}
    for uid in notify_ids:
        _notify(
            db,
            company.id,
            uid,
            "lead_converted",
            f"Lead converted to {target_type}",
            entity_id=lead.id,
            lead=lead,
            actor_id=user_id,
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
    lines = ["id,organization,contact,designation,email,phone,city,postcode,source,status,priority,value,assigned,converted,follow_up,meeting,created"]
    for r in rows:
        lines.append(
            ",".join(
                [
                    str(r.id),
                    f'"{r.organization or r.title}"',
                    f'"{r.contact_name or ""}"',
                    f'"{r.designation or ""}"',
                    r.email or "",
                    r.phone or "",
                    f'"{r.city or ""}"',
                    f'"{r.postcode or ""}"',
                    r.source or "",
                    r.status,
                    r.priority or "",
                    str(r.estimated_value or 0),
                    str(r.assigned_user_id or ""),
                    str(r.converted),
                    r.next_follow_up_at.isoformat() if r.next_follow_up_at else "",
                    r.meeting_at.isoformat() if r.meeting_at else "",
                    r.created_at.isoformat() if r.created_at else "",
                ]
            )
        )
    return "\n".join(lines)


def get_lead_detail(db: Session, user_id: int, lead_id: int) -> dict:
    lead = get_lead(db, user_id, lead_id)
    notes = db.query(LeadNote).filter(LeadNote.lead_id == lead_id).order_by(LeadNote.created_at.desc()).all()
    comms = db.query(LeadCommunication).filter(LeadCommunication.lead_id == lead_id).order_by(LeadCommunication.created_at.desc()).all()
    follow_ups = db.query(LeadFollowUp).filter(LeadFollowUp.lead_id == lead_id).order_by(LeadFollowUp.due_at).all()
    docs = db.query(LeadDocument).filter(LeadDocument.lead_id == lead_id).order_by(LeadDocument.created_at.desc()).all()
    quotes = db.query(LeadQuotation).filter(LeadQuotation.lead_id == lead_id).order_by(LeadQuotation.created_at.desc()).all()
    history = db.query(LeadStatusHistory).filter(LeadStatusHistory.lead_id == lead_id).order_by(LeadStatusHistory.created_at.desc()).all()
    conversions = db.query(LeadConversion).filter(LeadConversion.lead_id == lead_id).order_by(LeadConversion.created_at.desc()).all()
    return {
        "lead": lead,
        "notes": notes,
        "communications": comms,
        "follow_ups": follow_ups,
        "documents": docs,
        "quotations": quotes,
        "status_history": history,
        "conversions": conversions,
    }


def delete_filter_preset(db: Session, user_id: int, preset_id: int) -> None:
    company = require_leads_module(db, user_id)
    row = (
        db.query(LeadFilterPreset)
        .filter(LeadFilterPreset.id == preset_id, LeadFilterPreset.company_id == company.id, LeadFilterPreset.user_id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Preset not found")
    db.delete(row)
    db.commit()


def save_push_subscription(db: Session, user_id: int, endpoint: str, p256dh: str, auth_key: str) -> None:
    company = get_company_by_user_id(db, user_id)
    existing = db.query(PushSubscription).filter(PushSubscription.user_id == user_id, PushSubscription.endpoint == endpoint).first()
    if existing:
        existing.p256dh = p256dh
        existing.auth = auth_key
    else:
        db.add(PushSubscription(user_id=user_id, company_id=company.id, endpoint=endpoint, p256dh=p256dh, auth=auth_key))
    db.commit()


def list_lead_documents(db: Session, user_id: int, lead_id: int) -> List[LeadDocument]:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return db.query(LeadDocument).filter(LeadDocument.lead_id == lead_id).order_by(LeadDocument.created_at.desc()).all()


def list_lead_quotations(db: Session, user_id: int, lead_id: int) -> List[LeadQuotation]:
    company = require_leads_module(db, user_id)
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.company_id == company.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return db.query(LeadQuotation).filter(LeadQuotation.lead_id == lead_id).order_by(LeadQuotation.created_at.desc()).all()
