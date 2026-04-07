from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import date
from app.models import Invoice, InvoiceLine, Client, Site, Assignment
from app.schemas import InvoiceCreate, InvoiceLineBase
from app.services.company_service import get_company_by_user_id
from app.services.rate_service import resolve_billing_rate
from app.services.rota_service import shift_hours
from app.models import Allowance

def create_invoice(db: Session, data: InvoiceCreate, user_id: int) -> Invoice:
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == data.client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    inv = Invoice(company_id=company.id, **payload)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv

def get_invoices(db: Session, user_id: int, client_id: Optional[int] = None, status: Optional[str] = None) -> List[Invoice]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(Invoice).filter(Invoice.company_id == company.id)
    if client_id:
        q = q.filter(Invoice.client_id == client_id)
    if status:
        q = q.filter(Invoice.status == status)
    return q.order_by(Invoice.period_end.desc()).all()

def get_invoice(db: Session, invoice_id: int, user_id: int) -> Invoice:
    company = get_company_by_user_id(db, user_id)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
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
    line = InvoiceLine(invoice_id=invoice_id, site_id=data.site_id, guard_id=data.guard_id, hours=data.hours, rate=data.rate, amount=amount, allowance_amount=data.allowance_amount or 0)
    db.add(line)
    inv.total = (inv.total or 0) + amount
    db.commit()
    db.refresh(line)
    return line

def generate_from_assignments(db: Session, client_id: int, period_start: date, period_end: date, user_id: int) -> Invoice:
    company = get_company_by_user_id(db, user_id)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    sites = db.query(Site).filter(Site.company_id == company.id, Site.client_id == client_id).all()
    site_ids = [s.id for s in sites]
    if not site_ids:
        raise HTTPException(status_code=400, detail="No sites linked to client")
    assignments = db.query(Assignment).filter(
        Assignment.site_id.in_(site_ids),
        Assignment.date >= period_start,
        Assignment.date <= period_end
    ).all()
    inv = Invoice(company_id=company.id, client_id=client_id, period_start=period_start, period_end=period_end, total=0, status="draft")
    db.add(inv)
    db.flush()
    allowance_inv = db.query(Allowance).filter(Allowance.company_id == company.id, Allowance.in_invoice == True).all()
    total = 0.0
    anchor_site_id = site_ids[0]
    for a in assignments:
        r = resolve_billing_rate(db, company.id, a.guard_id, a.site_id, a.shift_type or "day", a.date)
        hrs = shift_hours(a)
        amt = hrs * r
        line = InvoiceLine(invoice_id=inv.id, site_id=a.site_id, guard_id=a.guard_id, hours=hrs, rate=r, amount=amt, allowance_amount=0)
        db.add(line)
        total += amt
    for al in allowance_inv:
        line = InvoiceLine(
            invoice_id=inv.id,
            site_id=anchor_site_id,
            guard_id=None,
            hours=0,
            rate=0,
            amount=al.amount,
            allowance_amount=al.amount,
        )
        db.add(line)
        total += al.amount
    inv.total = total
    db.commit()
    db.refresh(inv)
    return inv

def update_invoice_status(db: Session, invoice_id: int, status: str, user_id: int) -> Invoice:
    inv = get_invoice(db, invoice_id, user_id)
    inv.status = status
    db.commit()
    db.refresh(inv)
    return inv

def delete_invoice(db: Session, invoice_id: int, user_id: int) -> None:
    company = get_company_by_user_id(db, user_id)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    db.delete(inv)
    db.commit()
