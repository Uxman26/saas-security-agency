import json
from datetime import date, timedelta
from sqlalchemy.orm import Session, joinedload, noload
from fastapi import HTTPException
from typing import List, Optional, Any, Dict
from app.authz import assert_owned_by_company
from app.models import Allowance, AuditLog, Client, Guard, Invoice, InvoiceLine, Payment, RotaPlan, Site, User
from app.services.invoice_payment_service import invoice_amount_paid
from app.schemas import InvoiceCreate, InvoiceLineBase, InvoiceUpdate, InvoiceLineUpdate
from app.services.company_service import get_company_by_user_id
from app.services.rate_service import resolve_billing_rate
from app.services.special_day_service import special_date_set
from app.services.rota_service import calc_shift_hours, normalize_shift_type


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


def get_invoices(
    db: Session,
    user_id: int,
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    status_group: Optional[str] = None,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    search: Optional[str] = None,
) -> List[Invoice]:
    from sqlalchemy import or_, cast, String

    company = get_company_by_user_id(db, user_id)
    q = (
        db.query(Invoice)
        .options(noload(Invoice.lines), joinedload(Invoice.client), joinedload(Invoice.company))
        .filter(Invoice.company_id == company.id)
    )
    if client_id:
        q = q.filter(Invoice.client_id == client_id)
    if status_group == "unpaid":
        q = q.filter(Invoice.status.in_(("sent", "unpaid", "overdue", "partial")))
    elif status_group == "draft":
        q = q.filter(Invoice.status == "draft")
    elif status:
        q = q.filter(Invoice.status == status)
    if due_from:
        q = q.filter(Invoice.due_date >= due_from)
    if due_to:
        q = q.filter(Invoice.due_date <= due_to)
    if search:
        term = search.strip()
        if term:
            like = f"%{term}%"
            q = q.join(Client).filter(
                or_(
                    cast(Invoice.id, String).ilike(like),
                    Client.name.ilike(like),
                    Invoice.status.ilike(like),
                )
            )
    rows = q.order_by(Invoice.due_date.desc().nullslast(), Invoice.period_end.desc()).all()
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
    assert_owned_by_company(db, Guard, data.guard_id, company.id, field_name="guard_id")
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
    assert_owned_by_company(db, Guard, payload.get("guard_id"), company.id, field_name="guard_id")
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


def _parse_planner_json(raw: Any) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def _rota_invoice_shift_lines(
    db: Session,
    company_id: int,
    period_start: date,
    period_end: date,
    client_id: int,
    site_id: Optional[int] = None,
) -> list[dict]:
    """Billable shift rows from published rota planner data (not Assignment rows)."""
    sites_q = db.query(Site).filter(Site.company_id == company_id, Site.client_id == client_id)
    if site_id:
        sites_q = sites_q.filter(Site.id == site_id)
    sites = sites_q.all()
    if not sites:
        return []
    allowed_ids = {s.id for s in sites}
    site_by_name = {(s.name or "").strip().lower(): s for s in sites if s.name}

    plans = (
        db.query(RotaPlan)
        .filter(
            RotaPlan.company_id == company_id,
            RotaPlan.status == "published",
            RotaPlan.end_date >= period_start,
            RotaPlan.start_date <= period_end,
        )
        .all()
    )

    lines: list[dict] = []
    for plan in plans:
        data = _parse_planner_json(plan.planner_data)
        shifts = data.get("shifts") or {}
        for emp_id, by_day in shifts.items():
            try:
                guard_id = int(emp_id)
            except (TypeError, ValueError):
                continue
            for day_key, day_shifts in (by_day or {}).items():
                try:
                    shift_date = date.fromisoformat(str(day_key)[:10])
                except ValueError:
                    continue
                if shift_date < period_start or shift_date > period_end:
                    continue
                for sh in day_shifts or []:
                    if not isinstance(sh, dict):
                        continue
                    site_name = str(sh.get("site") or "").strip()
                    site = site_by_name.get(site_name.lower()) if site_name else None
                    if not site or site.id not in allowed_ids:
                        continue
                    break_m = int(sh.get("breakM") or 0) + int(sh.get("breakH") or 0) * 60
                    hours = calc_shift_hours(sh.get("start"), sh.get("end"), break_m)
                    if hours <= 0:
                        continue
                    lines.append(
                        {
                            "guard_id": guard_id,
                            "site_id": site.id,
                            "date": shift_date,
                            "hours": hours,
                            "shift_type": normalize_shift_type(sh.get("shiftType") or sh.get("shift_type") or "day"),
                        }
                    )
    return lines


def generate_from_rota(
    db: Session,
    period_start: date,
    period_end: date,
    user_id: int,
    client_id: Optional[int] = None,
    site_id: Optional[int] = None,
) -> Invoice:
    """Create a draft invoice from published rota planner shifts for a client/site period."""
    if period_start > period_end:
        raise HTTPException(status_code=400, detail="Period start cannot be after period end")
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

    details = _rota_invoice_shift_lines(
        db, company.id, period_start, period_end, client_id=client_id, site_id=site_id
    )
    allowance_inv = db.query(Allowance).filter(Allowance.company_id == company.id, Allowance.in_invoice == True).all()
    if not details and not allowance_inv:
        raise HTTPException(
            status_code=400,
            detail="No published rota shifts found for this client in the selected period. Publish the rota first.",
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
        r = resolve_billing_rate(
            db, company.id, d["guard_id"], d["site_id"], d["shift_type"], d["date"]
        )
        if double_client and d["date"] in special_dates:
            r = r * 2.0
        amt = round(d["hours"] * r, 2)
        db.add(
            InvoiceLine(
                invoice_id=inv.id,
                site_id=d["site_id"],
                guard_id=d["guard_id"],
                hours=d["hours"],
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
    log_invoice_audit(
        db,
        company.id,
        user_id,
        inv.id,
        "invoice_generated",
        {"client_id": client_id, "period_start": str(period_start), "period_end": str(period_end), "source": "rota"},
    )
    db.commit()
    return inv


# Backward-compatible alias — generation no longer reads Assignment rows.
generate_from_assignments = generate_from_rota


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


def duplicate_invoice(db: Session, invoice_id: int, user_id: int) -> Invoice:
    src = get_invoice(db, invoice_id, user_id)
    company = get_company_by_user_id(db, user_id)
    inv = Invoice(
        company_id=company.id,
        client_id=src.client_id,
        period_start=src.period_start,
        period_end=src.period_end,
        due_date=src.due_date,
        notes=src.notes,
        subtotal=src.subtotal,
        tax_rate=src.tax_rate,
        tax_amount=src.tax_amount,
        total=src.total,
        status="draft",
    )
    db.add(inv)
    db.flush()
    for ln in sorted(src.lines, key=lambda x: x.id):
        db.add(
            InvoiceLine(
                invoice_id=inv.id,
                site_id=ln.site_id,
                guard_id=ln.guard_id,
                hours=ln.hours,
                rate=ln.rate,
                amount=ln.amount,
                allowance_amount=ln.allowance_amount or 0,
            )
        )
    recalc_invoice_totals(db, inv)
    db.commit()
    db.refresh(inv)
    log_invoice_audit(db, company.id, user_id, inv.id, "invoice_duplicated", {"source_id": invoice_id})
    db.commit()
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
