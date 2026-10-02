from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, FixedExpense, RecurringInvoice, User, Vendor
from app.rbac import require_module
from app.services.company_service import get_company_by_user_id
from app.services import accounting_service

router = APIRouter(tags=["finance-ext"])


class VendorIn(BaseModel):
    name: str = Field(min_length=1)
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    status: str = "active"


@router.get("/vendors")
def list_vendors(db: Session = Depends(get_db), user: User = Depends(require_module("vendors", "view"))):
    company = get_company_by_user_id(db, user.id)
    rows = (
        db.query(Vendor)
        .filter(Vendor.company_id == company.id, Vendor.deleted_at.is_(None))
        .order_by(Vendor.name.asc())
        .all()
    )
    return [
        {"id": r.id, "name": r.name, "email": r.email, "phone": r.phone, "address": r.address, "notes": r.notes, "status": r.status}
        for r in rows
    ]


@router.post("/vendors", status_code=201)
def create_vendor(body: VendorIn, db: Session = Depends(get_db), user: User = Depends(require_module("vendors", "create"))):
    company = get_company_by_user_id(db, user.id)
    row = Vendor(company_id=company.id, **body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "email": row.email, "phone": row.phone, "address": row.address, "notes": row.notes, "status": row.status}


@router.patch("/vendors/{vendor_id}")
def patch_vendor(vendor_id: int, body: VendorIn, db: Session = Depends(get_db), user: User = Depends(require_module("vendors", "edit"))):
    company = get_company_by_user_id(db, user.id)
    row = db.query(Vendor).filter(Vendor.id == vendor_id, Vendor.company_id == company.id).first()
    if not row:
        raise HTTPException(404, "Vendor not found")
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    db.commit()
    return {"id": row.id, "name": row.name, "email": row.email, "phone": row.phone, "address": row.address, "notes": row.notes, "status": row.status}


@router.delete("/vendors/{vendor_id}", status_code=204)
def delete_vendor(vendor_id: int, db: Session = Depends(get_db), user: User = Depends(require_module("vendors", "delete"))):
    company = get_company_by_user_id(db, user.id)
    row = db.query(Vendor).filter(Vendor.id == vendor_id, Vendor.company_id == company.id).first()
    if not row:
        raise HTTPException(404, "Vendor not found")
    from datetime import datetime, timezone
    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by_user_id = user.id
    db.commit()


class FixedExpenseIn(BaseModel):
    vendor_id: Optional[int] = None
    category: str
    description: str
    amount: float
    vat_rate: float = 20
    day_of_month: int = 1
    start_date: date
    end_date: Optional[date] = None
    account_code: Optional[str] = None
    status: str = "active"


@router.get("/fixed-expenses")
def list_fixed(db: Session = Depends(get_db), user: User = Depends(require_module("fixed_expenses", "view"))):
    company = get_company_by_user_id(db, user.id)
    rows = db.query(FixedExpense).filter(FixedExpense.company_id == company.id).order_by(FixedExpense.id.desc()).all()
    return [
        {
            "id": r.id,
            "vendor_id": r.vendor_id,
            "category": r.category,
            "description": r.description,
            "amount": r.amount,
            "vat_rate": r.vat_rate,
            "day_of_month": r.day_of_month,
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "end_date": r.end_date.isoformat() if r.end_date else None,
            "next_run": r.next_run.isoformat() if r.next_run else None,
            "status": r.status,
            "account_code": r.account_code,
        }
        for r in rows
    ]


@router.post("/fixed-expenses", status_code=201)
def create_fixed(body: FixedExpenseIn, db: Session = Depends(get_db), user: User = Depends(require_module("fixed_expenses", "create"))):
    company = get_company_by_user_id(db, user.id)
    row = FixedExpense(company_id=company.id, next_run=body.start_date, **body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.patch("/fixed-expenses/{fid}/status")
def fixed_status(fid: int, status: str = Query(...), db: Session = Depends(get_db), user: User = Depends(require_module("fixed_expenses", "edit"))):
    company = get_company_by_user_id(db, user.id)
    row = db.query(FixedExpense).filter(FixedExpense.id == fid, FixedExpense.company_id == company.id).first()
    if not row:
        raise HTTPException(404)
    row.status = status
    db.commit()
    return {"id": row.id, "status": row.status}


class RecurringIn(BaseModel):
    client_id: Optional[int] = None
    site_id: Optional[int] = None
    frequency: str = "monthly"
    day_of_month: int = 1
    start_date: date
    end_date: Optional[date] = None
    tax_rate: float = 20
    notes: Optional[str] = None
    template_json: str = "[]"
    status: str = "active"


@router.get("/recurring-invoices")
def list_recurring(db: Session = Depends(get_db), user: User = Depends(require_module("recurring_invoices", "view"))):
    company = get_company_by_user_id(db, user.id)
    rows = db.query(RecurringInvoice).filter(RecurringInvoice.company_id == company.id).order_by(RecurringInvoice.id.desc()).all()
    return [
        {
            "id": r.id,
            "client_id": r.client_id,
            "site_id": r.site_id,
            "frequency": r.frequency,
            "day_of_month": r.day_of_month,
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "end_date": r.end_date.isoformat() if r.end_date else None,
            "next_run": r.next_run.isoformat() if r.next_run else None,
            "tax_rate": r.tax_rate,
            "notes": r.notes,
            "template_json": r.template_json,
            "status": r.status,
            "last_invoice_id": r.last_invoice_id,
        }
        for r in rows
    ]


@router.post("/recurring-invoices", status_code=201)
def create_recurring(body: RecurringIn, db: Session = Depends(get_db), user: User = Depends(require_module("recurring_invoices", "create"))):
    company = get_company_by_user_id(db, user.id)
    row = RecurringInvoice(company_id=company.id, next_run=body.start_date, **body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.patch("/recurring-invoices/{rid}/status")
def recurring_status(rid: int, status: str = Query(...), db: Session = Depends(get_db), user: User = Depends(require_module("recurring_invoices", "edit"))):
    company = get_company_by_user_id(db, user.id)
    row = db.query(RecurringInvoice).filter(RecurringInvoice.id == rid, RecurringInvoice.company_id == company.id).first()
    if not row:
        raise HTTPException(404)
    row.status = status
    db.commit()
    return {"id": row.id, "status": row.status}


@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db), user: User = Depends(require_module("chart_of_accounts", "view"))):
    company = get_company_by_user_id(db, user.id)
    accounting_service.ensure_default_coa(db, company.id)
    rows = db.query(Account).filter(Account.company_id == company.id).order_by(Account.code.asc()).all()
    return [
        {
            "id": r.id,
            "code": r.code,
            "name": r.name,
            "account_type": r.account_type,
            "parent_id": r.parent_id,
            "level": r.level,
            "is_system": bool(r.is_system),
            "status": r.status or "active",
        }
        for r in rows
    ]


class AccountIn(BaseModel):
    code: str = Field(min_length=1)
    name: str = Field(min_length=1)
    account_type: str
    parent_id: Optional[int] = None
    status: str = "active"


class AccountPatch(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    account_type: Optional[str] = None
    status: Optional[str] = None


@router.post("/accounts", status_code=201)
def create_account(body: AccountIn, db: Session = Depends(get_db), user: User = Depends(require_module("chart_of_accounts", "create"))):
    company = get_company_by_user_id(db, user.id)
    try:
        row = accounting_service.create_account(db, company.id, body.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "account_type": row.account_type,
        "parent_id": row.parent_id,
        "level": row.level,
        "is_system": bool(row.is_system),
        "status": row.status,
    }


@router.patch("/accounts/{account_id}")
def patch_account(
    account_id: int,
    body: AccountPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("chart_of_accounts", "edit")),
):
    company = get_company_by_user_id(db, user.id)
    try:
        row = accounting_service.update_account(db, company.id, account_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "account_type": row.account_type,
        "parent_id": row.parent_id,
        "level": row.level,
        "is_system": bool(row.is_system),
        "status": row.status,
    }


@router.get("/accounts/reports/trial-balance")
def trial_balance(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("chart_of_accounts", "view")),
):
    company = get_company_by_user_id(db, user.id)
    accounting_service.ensure_default_coa(db, company.id)
    return accounting_service.trial_balance(db, company.id, date_from, date_to)


@router.get("/accounts/reports/profit-loss")
def profit_loss(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("chart_of_accounts", "view")),
):
    company = get_company_by_user_id(db, user.id)
    return accounting_service.profit_and_loss(db, company.id, date_from, date_to)


@router.get("/accounts/reports/balance-sheet")
def balance_sheet(
    as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("chart_of_accounts", "view")),
):
    company = get_company_by_user_id(db, user.id)
    return accounting_service.balance_sheet(db, company.id, as_of)


@router.get("/accounts/reports/cash-flow")
def cash_flow_report(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("chart_of_accounts", "view")),
):
    company = get_company_by_user_id(db, user.id)
    return accounting_service.cash_flow(db, company.id, date_from, date_to)


@router.get("/accounts/reports/general-ledger")
def general_ledger(
    account_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("chart_of_accounts", "view")),
):
    company = get_company_by_user_id(db, user.id)
    return accounting_service.general_ledger(
        db, company.id, account_id=account_id, date_from=date_from, date_to=date_to
    )


@router.get("/accounts/reports/ar-aging")
def ar_aging(
    as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("chart_of_accounts", "view")),
):
    company = get_company_by_user_id(db, user.id)
    return accounting_service.ar_aging(db, company.id, as_of)


@router.get("/accounts/reports/ap-aging")
def ap_aging(
    as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("chart_of_accounts", "view")),
):
    company = get_company_by_user_id(db, user.id)
    return accounting_service.ap_aging(db, company.id, as_of)
