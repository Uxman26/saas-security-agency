import json
from datetime import date, timedelta
from sqlalchemy.orm import Session, joinedload, noload
from fastapi import HTTPException
from typing import List, Optional, Any, Dict
from app.models import Allowance, Assignment, AuditLog, Client, Invoice, InvoiceLine, Payment, Site, User
from app.services.invoice_payment_service import invoice_amount_paid
from app.schemas import InvoiceCreate, InvoiceLineBase, InvoiceUpdate, InvoiceLineUpdate
from app.services.company_service import get_company_by_user_id
from app.services.rate_service import resolve_billing_rate
from app.services.special_day_service import special_date_set
from app.services.rota_service import list_rota_details


DEFAULT_INVOICE_VAT_RATE = 20.0

def recalc_invoice_totals(db: Session, inv: Invoice) -> None:
    lines = db.query(InvoiceLine).filter(InvoiceLine.invoice_id == inv.id).all()
    subtotal = sum((l.amount or 0) for l in lines)
    if not lines:
        subtotal = float(inv.subtotal or inv.total or 0)
    rate = inv.tax_rate or 0
    tax = round(subtotal * rate / 100.0, 2)
    inv.subtotal = round(subtotal, 2)
    inv.tax_amount = tax
    inv.total = round(subtotal + tax, 2)


def maybe_mark_overdue(db: Session, inv: Invoice) -> bool:
    from app.services.invoice_payment_service import sync_invoice_payment_status
    if inv.status in ("paid", "partial", "cancelled", "draft"):
        sync_invoice_payment_status(db, inv)
        return False
    if inv.due_date and inv.due_date < date.today() and inv.status in ("sent", "unpaid"):
        inv.status = "overdue"
        return True
    sync_invoice_payment_status(db, inv)
    return False


def log_invoice_audit(
    db: Session,
    company_id: int,
    user_id: int,
    invoice_id: int,
    action: str,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    db.add(
        AuditLog(
            company_id=company_id,
            user_id=user_id,
            action=action,
            entity_type="invoice",
            entity_id=invoice_id,
            meta=json.dumps(meta) if meta else None,
        )
    )


def create_invoice(db: Session, data: InvoiceCreate, user_id: int) -> Invoice:
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == data.client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    inv = Invoice(company_id=company.id, **payload)
    if not inv.subtotal and inv.total:
        inv.subtotal = inv.total
    db.add(inv)
    db.flush()
    recalc_invoice_totals(db, inv)
    db.commit()
    db.refresh(inv)
    log_invoice_audit(db, company.id, user_id, inv.id, "invoice_created", {"client_id": inv.client_id})
    db.commit()
    return inv


def get_invoices(db: Session, user_id: int, client_id: Optional[int] = None, status: Optional[str] = None) -> List[Invoice]:
    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(Invoice)
        .options(noload(Invoice.lines), joinedload(Invoice.client), joinedload(Invoice.company))
        .filter(Invoice.company_id == company.id)
    )
    if client_id:
        q = q.filter(Invoice.client_id == client_id)
    if status:
        q = q.filter(Invoice.status == status)
    rows = q.order_by(Invoice.period_end.desc()).all()
    changed = False
    for inv in rows:
        if maybe_mark_overdue(db, inv):
            changed = True
    if changed:
        db.commit()
        for inv in rows:
            db.refresh(inv)
    return rows


def get_invoice(db: Session, invoice_id: int, user_id: int) -> Invoice:
    company = get_company_by_user_id(db, user_id)
    inv = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.lines).joinedload(InvoiceLine.site),
            joinedload(Invoice.lines).joinedload(InvoiceLine.guard),
            joinedload(Invoice.client),
            joinedload(Invoice.company),
        )
        .filter(Invoice.id == invoice_id, Invoice.company_id == company.id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if maybe_mark_overdue(db, inv):
        db.commit()
        db.refresh(inv)
    return inv


def update_invoice(db: Session, invoice_id: int, data: InvoiceUpdate, user_id: int) -> Invoice:
    inv = get_invoice(db, invoice_id, user_id)
    company = get_company_by_user_id(db, user_id)
    payload = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else {k: v for k, v in data.dict().items() if v is not None}
    def _snap(v: Any) -> Any:
        if v is None:
            return None
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return v

    before = {k: _snap(getattr(inv, k)) for k in payload.keys() if hasattr(inv, k)}
    for k, v in payload.items():
        if hasattr(inv, k):
            setattr(inv, k, v)
    recalc_invoice_totals(db, inv)
    db.commit()
    db.refresh(inv)
    log_invoice_audit(
        db,
        company.id,
        user_id,
        inv.id,
        "invoice_updated",
        {"before": before, "fields": list(payload.keys())},
    )
    db.commit()
    return inv


def add_invoice_line(db: Session, invoice_id: int, data: InvoiceLineBase, user_id: int) -> InvoiceLine:
    company = get_company_by_user_id(db, user_id)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    site = db.query(Site).filter(Site.id == data.site_id, Site.company_id == company.id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    amount = data.hours * data.rate + (data.allowance_amount or 0)
    line = InvoiceLine(
        invoice_id=invoice_id,
        site_id=data.site_id,
        guard_id=data.guard_id,
        hours=data.hours,
        rate=data.rate,
        amount=amount,
        allowance_amount=data.allowance_amount or 0,
    )
    db.add(line)
    recalc_invoice_totals(db, inv)
    db.commit()
    db.refresh(line)
    log_invoice_audit(db, company.id, user_id, invoice_id, "line_added", {"line_id": line.id, "site_id": data.site_id})
    db.commit()
    return line


def update_invoice_line(db: Session, invoice_id: int, line_id: int, data: InvoiceLineUpdate, user_id: int) -> InvoiceLine:
    company = get_company_by_user_id(db, user_id)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    line = db.query(InvoiceLine).filter(InvoiceLine.id == line_id, InvoiceLine.invoice_id == invoice_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    payload = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else data.dict(exclude_unset=True)
    if payload.get("site_id") is not None:
        site = db.query(Site).filter(Site.id == payload["site_id"], Site.company_id == company.id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    for k, v in payload.items():
        setattr(line, k, v)
    line.amount = (line.hours or 0) * (line.rate or 0) + (line.allowance_amount or 0)
    recalc_invoice_totals(db, inv)
    db.commit()
    db.refresh(line)
    log_invoice_audit(db, company.id, user_id, invoice_id, "line_updated", {"line_id": line_id, "fields": list(payload.keys())})
    db.commit()
    return line


def delete_invoice_line(db: Session, invoice_id: int, line_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    line = db.query(InvoiceLine).filter(InvoiceLine.id == line_id, InvoiceLine.invoice_id == invoice_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    db.delete(line)
    recalc_invoice_totals(db, inv)
    db.commit()
    log_invoice_audit(db, company.id, user_id, invoice_id, "line_deleted", {"line_id": line_id})
    db.commit()


def generate_from_assignments(
    db: Session,
    period_start: date,
    period_end: date,
    user_id: int,
    client_id: Optional[int] = None,
    site_id: Optional[int] = None,
) -> Invoice:
    company = get_company_by_user_id(db, user_id)
    if site_id:
        site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        if not site.client_id:
            raise HTTPException(status_code=400, detail="Site is not linked to a client")
        client_id = site.client_id
    if not client_id:
        raise HTTPException(status_code=400, detail="client_id or site_id required")
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    sites = db.query(Site).filter(Site.company_id == company.id, Site.client_id == client_id).all()
    if not sites:
        raise HTTPException(status_code=400, detail="No sites linked to this client")
    details = list_rota_details(
        db, user_id, period_start, period_end, client_id=client_id, site_id=site_id
    )
    allowance_inv = db.query(Allowance).filter(Allowance.company_id == company.id, Allowance.in_invoice == True).all()
    if not details and not allowance_inv:
        raise HTTPException(
            status_code=400,
            detail="No shifts found for this client in the selected period. Publish the rota or add assignments first.",
        )
    due = period_end + timedelta(days=30)
    inv = Invoice(
        company_id=company.id,
        client_id=client_id,
        period_start=period_start,
        period_end=period_end,
        due_date=due,
        total=0,
        subtotal=0,
        tax_rate=DEFAULT_INVOICE_VAT_RATE,
        tax_amount=0,
        status="draft",
    )
    db.add(inv)
    db.flush()
    anchor_site_id = sites[0].id
    special_dates = special_date_set(db, company.id)
    double_client = bool(getattr(client, "double_rate_special_days", False))
    for d in details:
        r = resolve_billing_rate(db, company.id, d.guard_id, d.site_id, d.shift_type or "day", d.date)
        if double_client and d.date in special_dates:
            r = r * 2.0
        amt = round(d.hours * r, 2)
        db.add(
            InvoiceLine(
                invoice_id=inv.id,
                site_id=d.site_id,
                guard_id=d.guard_id,
                hours=d.hours,
                rate=r,
                amount=amt,
                allowance_amount=0,
            )
        )
    for al in allowance_inv:
        db.add(
            InvoiceLine(
                invoice_id=inv.id,
                site_id=anchor_site_id,
                guard_id=None,
                hours=0,
                rate=0,
                amount=al.amount,
                allowance_amount=al.amount,
            )
        )
    recalc_invoice_totals(db, inv)
    db.commit()
    db.refresh(inv)
    log_invoice_audit(db, company.id, user_id, inv.id, "invoice_generated", {"client_id": client_id, "period_start": str(period_start), "period_end": str(period_end)})
    db.commit()
    return inv


def update_invoice_status(db: Session, invoice_id: int, status: str, user_id: int) -> Invoice:
    inv = get_invoice(db, invoice_id, user_id)
    company = get_company_by_user_id(db, user_id)
    prev = inv.status
    inv.status = status
    db.commit()
    db.refresh(inv)
    log_invoice_audit(db, company.id, user_id, inv.id, "status_changed", {"from": prev, "to": status})
    db.commit()
    if status == "sent" and prev != "sent":
        from app.services import sms_trigger_service, email_trigger_service
        sms_trigger_service.notify_invoice_sent(db, user_id, inv)
        email_trigger_service.notify_invoice_sent(db, user_id, inv)
    return inv


def delete_invoice(db: Session, invoice_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    log_invoice_audit(db, company.id, user_id, invoice_id, "invoice_deleted", {})
    db.delete(inv)
    db.commit()


def get_invoice_audit_logs(db: Session, invoice_id: int, user_id: int) -> List[Dict[str, Any]]:
    company = get_company_by_user_id(db, user_id)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    rows = (
        db.query(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .filter(AuditLog.entity_type == "invoice", AuditLog.entity_id == invoice_id, AuditLog.company_id == company.id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    out = []
    for al, u in rows:
        meta = None
        if al.meta:
            try:
                meta = json.loads(al.meta)
            except json.JSONDecodeError:
                meta = None
        out.append(
            {
                "id": al.id,
                "created_at": al.created_at,
                "user_id": al.user_id,
                "user_name": u.full_name if u else None,
                "action": al.action,
                "meta": meta,
            }
        )
    return out
