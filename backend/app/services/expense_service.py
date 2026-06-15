import os
import shutil
from calendar import monthrange
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Expense, Invoice
from app.schemas import ExpenseCreate, ExpenseUpdate
from app.services.company_service import get_company_by_user_id
from app.storage_paths import EXPENSES_DIR, ensure_upload_dirs, resolve_storage_path

VAT_RATE = 0.20
MAX_DOC_BYTES = 300 * 1024
ALLOWED_MIME = {"image/png", "image/jpeg", "image/jpg"}
ALLOWED_EXT = {".png", ".jpg", ".jpeg"}

EXPENSE_CATEGORIES = [
    "fuel",
    "electricity",
    "rent",
    "internet",
    "office_supplies",
    "maintenance",
    "travel",
    "other",
]

PAYMENT_METHODS = ["bank_transfer", "card", "cash", "direct_debit", "cheque", "other"]
PAYMENT_STATUSES = ["pending", "paid", "overdue", "cancelled"]


def calc_vat(amount_ex_vat: float) -> tuple[float, float]:
    ex = round(max(0.0, float(amount_ex_vat)), 2)
    vat = round(ex * VAT_RATE, 2)
    return ex, vat, round(ex + vat, 2)


def _to_response(exp: Expense) -> dict:
    return {
        "id": exp.id,
        "company_id": exp.company_id,
        "expense_date": exp.expense_date,
        "category": exp.category,
        "vendor_name": exp.vendor_name,
        "reference_number": exp.reference_number,
        "description": exp.description,
        "amount_ex_vat": exp.amount_ex_vat,
        "vat_amount": exp.vat_amount,
        "total_amount": exp.total_amount,
        "payment_method": exp.payment_method,
        "payment_status": exp.payment_status,
        "has_document": bool(resolve_storage_path(exp.document_path)),
        "created_at": exp.created_at,
        "updated_at": exp.updated_at,
    }


def _get_expense(db: Session, expense_id: int, user_id: int) -> Expense:
    company = get_company_by_user_id(db, user_id)
    exp = db.query(Expense).filter(Expense.id == expense_id, Expense.company_id == company.id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    return exp


def list_expenses(
    db: Session,
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    payment_status: Optional[str] = None,
) -> List[dict]:
    company = get_company_by_user_id(db, user_id)
    q = db.query(Expense).filter(Expense.company_id == company.id)
    if start_date:
        q = q.filter(Expense.expense_date >= start_date)
    if end_date:
        q = q.filter(Expense.expense_date <= end_date)
    if category:
        q = q.filter(Expense.category == category)
    if payment_status:
        q = q.filter(Expense.payment_status == payment_status)
    rows = q.order_by(Expense.expense_date.desc(), Expense.id.desc()).all()
    return [_to_response(e) for e in rows]


def get_expense(db: Session, expense_id: int, user_id: int) -> dict:
    return _to_response(_get_expense(db, expense_id, user_id))


def create_expense(db: Session, data: ExpenseCreate, user_id: int) -> dict:
    company = get_company_by_user_id(db, user_id)
    ex, vat, total = calc_vat(data.amount_ex_vat)
    exp = Expense(
        company_id=company.id,
        expense_date=data.expense_date,
        category=data.category,
        vendor_name=data.vendor_name,
        reference_number=data.reference_number,
        description=data.description,
        amount_ex_vat=ex,
        vat_amount=vat,
        total_amount=total,
        payment_method=data.payment_method,
        payment_status=data.payment_status or "pending",
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return _to_response(exp)


def update_expense(db: Session, expense_id: int, data: ExpenseUpdate, user_id: int) -> dict:
    exp = _get_expense(db, expense_id, user_id)
    payload = data.model_dump(exclude_unset=True)
    if "amount_ex_vat" in payload:
        ex, vat, total = calc_vat(payload["amount_ex_vat"])
        payload["amount_ex_vat"] = ex
        payload["vat_amount"] = vat
        payload["total_amount"] = total
    for k, v in payload.items():
        setattr(exp, k, v)
    db.commit()
    db.refresh(exp)
    return _to_response(exp)


def delete_expense(db: Session, expense_id: int, user_id: int) -> None:
    exp = _get_expense(db, expense_id, user_id)
    path = resolve_storage_path(exp.document_path)
    if path and os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass
    db.delete(exp)
    db.commit()


def save_expense_document(db: Session, expense_id: int, file: UploadFile, user_id: int) -> dict:
    exp = _get_expense(db, expense_id, user_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only PNG and JPEG files are allowed")
    content_type = (file.content_type or "").lower()
    if content_type and content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Only PNG and JPEG files are allowed")
    raw = file.file.read()
    if len(raw) > MAX_DOC_BYTES:
        raise HTTPException(status_code=400, detail="File must be 300 KB or smaller")
    ensure_upload_dirs()
    dest = os.path.join(EXPENSES_DIR, f"expense_{exp.id}{ext}")
    old = resolve_storage_path(exp.document_path)
    if old and old != dest and os.path.isfile(old):
        try:
            os.remove(old)
        except OSError:
            pass
    with open(dest, "wb") as out:
        out.write(raw)
    exp.document_path = dest
    exp.document_mime = "image/png" if ext == ".png" else "image/jpeg"
    db.commit()
    db.refresh(exp)
    return _to_response(exp)


def delete_expense_document(db: Session, expense_id: int, user_id: int) -> dict:
    exp = _get_expense(db, expense_id, user_id)
    path = resolve_storage_path(exp.document_path)
    if path and os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass
    exp.document_path = None
    exp.document_mime = None
    db.commit()
    db.refresh(exp)
    return _to_response(exp)


def get_expense_document_path(db: Session, expense_id: int, user_id: int) -> tuple[str, str]:
    exp = _get_expense(db, expense_id, user_id)
    path = resolve_storage_path(exp.document_path)
    if not path:
        raise HTTPException(status_code=404, detail="No document attached")
    return path, exp.document_mime or "image/jpeg"


def _expense_totals(db: Session, company_id: int, start: date, end: date) -> dict:
    rows = (
        db.query(
            func.coalesce(func.sum(Expense.amount_ex_vat), 0),
            func.coalesce(func.sum(Expense.vat_amount), 0),
            func.coalesce(func.sum(Expense.total_amount), 0),
        )
        .filter(
            Expense.company_id == company_id,
            Expense.expense_date >= start,
            Expense.expense_date <= end,
            Expense.payment_status != "cancelled",
        )
        .first()
    )
    return {
        "total_ex_vat": round(float(rows[0] or 0), 2),
        "total_vat": round(float(rows[1] or 0), 2),
        "total_inc_vat": round(float(rows[2] or 0), 2),
    }


def _invoice_vat_total(db: Session, company_id: int, start: date, end: date) -> float:
    val = (
        db.query(func.coalesce(func.sum(Invoice.tax_amount), 0))
        .filter(
            Invoice.company_id == company_id,
            Invoice.period_end >= start,
            Invoice.period_end <= end,
            Invoice.status.notin_(["draft", "cancelled"]),
        )
        .scalar()
    )
    return round(float(val or 0), 2)


def dashboard_summary(db: Session, user_id: int, start_date: date, end_date: date) -> dict:
    company = get_company_by_user_id(db, user_id)
    totals = _expense_totals(db, company.id, start_date, end_date)
    expense_vat = totals["total_vat"]
    invoice_vat = _invoice_vat_total(db, company.id, start_date, end_date)
    net_vat = round(invoice_vat - expense_vat, 2)

    by_cat = (
        db.query(
            Expense.category,
            func.sum(Expense.total_amount),
            func.sum(Expense.vat_amount),
            func.count(Expense.id),
        )
        .filter(
            Expense.company_id == company.id,
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date,
            Expense.payment_status != "cancelled",
        )
        .group_by(Expense.category)
        .all()
    )
    category_summary = [
        {
            "category": c,
            "total_inc_vat": round(float(t or 0), 2),
            "vat_amount": round(float(v or 0), 2),
            "count": int(n or 0),
        }
        for c, t, v, n in by_cat
    ]

    recent = (
        db.query(Expense)
        .filter(Expense.company_id == company.id, Expense.payment_status != "cancelled")
        .order_by(Expense.expense_date.desc(), Expense.id.desc())
        .limit(8)
        .all()
    )

    quarterly = []
    year = end_date.year
    for q in range(1, 5):
        m0 = (q - 1) * 3 + 1
        m1 = m0 + 2
        qs = date(year, m0, 1)
        qe = date(year, m1, monthrange(year, m1)[1])
        et = _expense_totals(db, company.id, qs, qe)
        iv = _invoice_vat_total(db, company.id, qs, qe)
        quarterly.append(
            {
                "quarter": f"Q{q} {year}",
                "start_date": qs.isoformat(),
                "end_date": qe.isoformat(),
                "expense_vat": et["total_vat"],
                "invoice_vat": iv,
                "net_vat": round(iv - et["total_vat"], 2),
            }
        )

    return {
        "period_start": start_date,
        "period_end": end_date,
        "total_expenses_ex_vat": totals["total_ex_vat"],
        "total_expense_vat": expense_vat,
        "total_invoice_vat": invoice_vat,
        "net_vat_payable": net_vat,
        "total_expenses_inc_vat": totals["total_inc_vat"],
        "category_summary": category_summary,
        "recent_expenses": [_to_response(e) for e in recent],
        "quarterly_vat": quarterly,
    }


def expense_report(db: Session, user_id: int, start_date: date, end_date: date, group_by: str) -> dict:
    company = get_company_by_user_id(db, user_id)
    totals = _expense_totals(db, company.id, start_date, end_date)
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == company.id,
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date,
            Expense.payment_status != "cancelled",
        )
        .all()
    )

    breakdown: dict[str, dict] = {}
    for e in rows:
        if group_by == "vendor":
            key = (e.vendor_name or "Unknown").strip() or "Unknown"
        elif group_by == "month":
            key = e.expense_date.strftime("%Y-%m")
        else:
            key = e.category or "other"
        if key not in breakdown:
            breakdown[key] = {"key": key, "count": 0, "ex_vat": 0.0, "vat": 0.0, "inc_vat": 0.0}
        breakdown[key]["count"] += 1
        breakdown[key]["ex_vat"] += float(e.amount_ex_vat or 0)
        breakdown[key]["vat"] += float(e.vat_amount or 0)
        breakdown[key]["inc_vat"] += float(e.total_amount or 0)

    items = []
    for v in breakdown.values():
        items.append(
            {
                "key": v["key"],
                "count": v["count"],
                "total_ex_vat": round(v["ex_vat"], 2),
                "total_vat": round(v["vat"], 2),
                "total_inc_vat": round(v["inc_vat"], 2),
            }
        )
    items.sort(key=lambda x: x["total_inc_vat"], reverse=True)

    return {
        "period_start": start_date,
        "period_end": end_date,
        "group_by": group_by,
        "totals": totals,
        "breakdown": items,
    }


def vat_report(db: Session, user_id: int, start_date: date, end_date: date) -> dict:
    company = get_company_by_user_id(db, user_id)
    expense_totals = _expense_totals(db, company.id, start_date, end_date)
    expense_vat = expense_totals["total_vat"]
    invoice_vat = _invoice_vat_total(db, company.id, start_date, end_date)
    net_vat = round(invoice_vat - expense_vat, 2)
    return {
        "period_start": start_date,
        "period_end": end_date,
        "expense_vat_total": expense_vat,
        "invoice_vat_total": invoice_vat,
        "net_vat_summary": net_vat,
        "total_vat_report": {
            "collected_on_invoices": invoice_vat,
            "paid_on_expenses": expense_vat,
            "net_payable_or_refundable": net_vat,
        },
        "expense_totals": expense_totals,
    }
