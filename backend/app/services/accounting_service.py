from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from app.models import (
    Account,
    CreditNote,
    Expense,
    FixedExpense,
    Invoice,
    JournalEntry,
    JournalLine,
    Payment,
    Payroll,
    RecurringInvoice,
)

DEFAULT_COA = [
    ("1000", "Assets", "asset", None, 1),
    ("1100", "Current Assets", "asset", "1000", 2),
    ("1110", "Bank", "asset", "1100", 3),
    ("1120", "Cash", "asset", "1100", 3),
    ("1130", "Accounts Receivable", "asset", "1100", 3),
    ("1140", "Undeposited Funds", "asset", "1100", 3),
    ("1200", "VAT Recoverable", "asset", "1100", 3),
    ("1300", "Prepayments", "asset", "1100", 3),
    ("1500", "Fixed Assets", "asset", "1000", 2),
    ("1510", "Property & Equipment", "asset", "1500", 3),
    ("1520", "Accumulated Depreciation", "asset", "1500", 3),
    ("2000", "Liabilities", "liability", None, 1),
    ("2100", "Current Liabilities", "liability", "2000", 2),
    ("2110", "Accounts Payable", "liability", "2100", 3),
    ("2120", "VAT Payable", "liability", "2100", 3),
    ("2130", "Payroll Liabilities", "liability", "2100", 3),
    ("2140", "Accruals", "liability", "2100", 3),
    ("2200", "Long-term Liabilities", "liability", "2000", 2),
    ("2210", "Loans Payable", "liability", "2200", 3),
    ("3000", "Equity", "equity", None, 1),
    ("3100", "Owner Equity", "equity", "3000", 2),
    ("3110", "Retained Earnings", "equity", "3100", 3),
    ("3120", "Owner Drawings", "equity", "3100", 3),
    ("4000", "Income", "income", None, 1),
    ("4100", "Operating Income", "income", "4000", 2),
    ("4110", "Service Revenue", "income", "4100", 3),
    ("4120", "Other Income", "income", "4100", 3),
    ("4200", "Sales Adjustments", "income", "4000", 2),
    ("4210", "Credit Notes / Returns", "income", "4200", 3),
    ("5000", "Expenses", "expense", None, 1),
    ("5100", "Operating Expenses", "expense", "5000", 2),
    ("5110", "General Expenses", "expense", "5100", 3),
    ("5120", "Payroll Expenses", "expense", "5100", 3),
    ("5130", "Rent & Premises", "expense", "5100", 3),
    ("5140", "Utilities", "expense", "5100", 3),
    ("5150", "Travel & Fuel", "expense", "5100", 3),
    ("5160", "Insurance", "expense", "5100", 3),
    ("5170", "Office Supplies", "expense", "5100", 3),
    ("5180", "Professional Fees", "expense", "5100", 3),
    ("5200", "Cost of Sales", "expense", "5000", 2),
    ("5210", "Direct Labour", "expense", "5200", 3),
]


def ensure_default_coa(db: Session, company_id: int) -> None:
    existing = {a.code: a for a in db.query(Account).filter(Account.company_id == company_id).all()}
    code_to_id = {code: a.id for code, a in existing.items()}
    added = False
    for code, name, typ, parent_code, level in DEFAULT_COA:
        if code in existing:
            continue
        parent_id = code_to_id.get(parent_code) if parent_code else None
        row = Account(
            company_id=company_id,
            code=code,
            name=name,
            account_type=typ,
            parent_id=parent_id,
            level=level,
            is_system=True,
            status="active",
        )
        db.add(row)
        db.flush()
        code_to_id[code] = row.id
        existing[code] = row
        added = True
    if added:
        db.commit()


def _acct(db: Session, company_id: int, code: str) -> Optional[Account]:
    return db.query(Account).filter(Account.company_id == company_id, Account.code == code).first()


def _already_posted(db: Session, company_id: int, source_type: str, source_id: int) -> bool:
    return (
        db.query(JournalEntry.id)
        .filter(
            JournalEntry.company_id == company_id,
            JournalEntry.source_type == source_type,
            JournalEntry.source_id == source_id,
        )
        .first()
        is not None
    )


def _post_entry(
    db: Session,
    company_id: int,
    *,
    entry_date: date,
    reference: str,
    memo: str,
    source_type: str,
    source_id: int,
    lines: list[tuple[Account, float, float]],
) -> None:
    debit_total = round(sum(d for _, d, _ in lines), 2)
    credit_total = round(sum(c for _, _, c in lines), 2)
    if abs(debit_total - credit_total) > 0.02:
        return
    entry = JournalEntry(
        company_id=company_id,
        entry_date=entry_date,
        reference=reference,
        memo=memo,
        source_type=source_type,
        source_id=source_id,
    )
    db.add(entry)
    db.flush()
    for acct, debit, credit in lines:
        db.add(JournalLine(entry_id=entry.id, account_id=acct.id, debit=round(debit, 2), credit=round(credit, 2)))
    db.commit()


def post_payment(db: Session, company_id: int, payment: Payment) -> None:
    ensure_default_coa(db, company_id)
    if _already_posted(db, company_id, "payment", payment.id):
        return
    bank = _acct(db, company_id, "1110")
    ar = _acct(db, company_id, "1130")
    if not bank or not ar:
        return
    amt = float(payment.amount or 0)
    if amt <= 0:
        return
    paid_date = payment.paid_at.date() if getattr(payment.paid_at, "date", None) else date.today()
    _post_entry(
        db,
        company_id,
        entry_date=paid_date,
        reference=f"PAY-{payment.id}",
        memo="Customer payment",
        source_type="payment",
        source_id=payment.id,
        lines=[(bank, amt, 0.0), (ar, 0.0, amt)],
    )


def post_expense(db: Session, company_id: int, expense: Expense) -> None:
    ensure_default_coa(db, company_id)
    if _already_posted(db, company_id, "expense", expense.id):
        return
    cat = (expense.category or "").lower()
    code = "5110"
    if cat in ("rent",):
        code = "5130"
    elif cat in ("electricity", "internet", "utilities"):
        code = "5140"
    elif cat in ("fuel", "travel"):
        code = "5150"
    elif cat in ("office_supplies",):
        code = "5170"
    exp = _acct(db, company_id, code) or _acct(db, company_id, "5110")
    bank = _acct(db, company_id, "1110")
    vat = _acct(db, company_id, "1200")
    ap = _acct(db, company_id, "2110")
    if not exp or not bank:
        return
    entry_date = expense.expense_date or date.today()
    ex = float(expense.amount_ex_vat or 0)
    vat_amt = float(expense.vat_amount or 0)
    total = float(expense.total_amount or 0)
    lines: list[tuple[Account, float, float]] = [(exp, ex, 0.0)]
    if vat_amt > 0 and vat:
        lines.append((vat, vat_amt, 0.0))
    credit_acct = ap if (expense.payment_status or "") == "pending" and ap else bank
    lines.append((credit_acct, 0.0, total))
    _post_entry(
        db,
        company_id,
        entry_date=entry_date,
        reference=f"EXP-{expense.id}",
        memo=expense.description or expense.category or "Expense",
        source_type="expense",
        source_id=expense.id,
        lines=lines,
    )


def post_invoice_issued(db: Session, company_id: int, invoice: Invoice) -> None:
    ensure_default_coa(db, company_id)
    if _already_posted(db, company_id, "invoice", invoice.id):
        return
    ar = _acct(db, company_id, "1130")
    rev = _acct(db, company_id, "4110")
    vat = _acct(db, company_id, "2120")
    if not ar or not rev:
        return
    lines: list[tuple[Account, float, float]] = [
        (ar, float(invoice.total or 0), 0.0),
        (rev, 0.0, float(invoice.subtotal or 0)),
    ]
    if float(invoice.tax_amount or 0) > 0 and vat:
        lines.append((vat, 0.0, float(invoice.tax_amount or 0)))
    _post_entry(
        db,
        company_id,
        entry_date=invoice.invoice_date or date.today(),
        reference=f"INV-{invoice.id}",
        memo="Invoice issued",
        source_type="invoice",
        source_id=invoice.id,
        lines=lines,
    )


def post_credit_note(db: Session, company_id: int, cn: CreditNote) -> None:
    ensure_default_coa(db, company_id)
    if _already_posted(db, company_id, "credit_note", cn.id):
        return
    ar = _acct(db, company_id, "1130")
    adj = _acct(db, company_id, "4210") or _acct(db, company_id, "4110")
    vat = _acct(db, company_id, "2120")
    if not ar or not adj:
        return
    total = float(cn.total or 0)
    sub = float(cn.subtotal or 0)
    tax = float(cn.tax_amount or 0)
    lines: list[tuple[Account, float, float]] = [
        (adj, sub if sub else total, 0.0),
        (ar, 0.0, total),
    ]
    if tax > 0 and vat:
        lines = [(adj, sub, 0.0), (vat, tax, 0.0), (ar, 0.0, total)]
    _post_entry(
        db,
        company_id,
        entry_date=cn.credit_date or date.today(),
        reference=f"CN-{cn.number or cn.id}",
        memo="Credit note issued",
        source_type="credit_note",
        source_id=cn.id,
        lines=lines,
    )


def post_payroll(db: Session, company_id: int, payroll: Payroll) -> None:
    ensure_default_coa(db, company_id)
    if _already_posted(db, company_id, "payroll", payroll.id):
        return
    labour = _acct(db, company_id, "5210") or _acct(db, company_id, "5120")
    bank = _acct(db, company_id, "1110")
    liab = _acct(db, company_id, "2130")
    if not labour or not bank:
        return
    total = float(payroll.bank_amount or 0) + float(payroll.cash_amount or 0)
    if total <= 0:
        base = float(payroll.total_hours or 0) * float(payroll.hourly_rate or 0) + float(payroll.allowance_total or 0)
        total = base
    if total <= 0:
        return
    credit_acct = liab or bank
    _post_entry(
        db,
        company_id,
        entry_date=payroll.period_end or date.today(),
        reference=f"PR-{payroll.id}",
        memo="Payroll",
        source_type="payroll",
        source_id=payroll.id,
        lines=[(labour, total, 0.0), (credit_acct, 0.0, total)],
    )


def trial_balance(
    db: Session,
    company_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[dict]:
    ensure_default_coa(db, company_id)
    q = (
        db.query(Account, JournalLine, JournalEntry)
        .outerjoin(JournalLine, JournalLine.account_id == Account.id)
        .outerjoin(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .filter(Account.company_id == company_id, Account.level == 3)
    )
    rows = q.all()
    totals: dict[int, dict] = {}
    for acct, line, entry in rows:
        t = totals.setdefault(
            acct.id,
            {"id": acct.id, "code": acct.code, "name": acct.name, "type": acct.account_type, "debit": 0.0, "credit": 0.0},
        )
        if not line or not entry:
            continue
        if date_from and entry.entry_date < date_from:
            continue
        if date_to and entry.entry_date > date_to:
            continue
        t["debit"] += float(line.debit or 0)
        t["credit"] += float(line.credit or 0)
    return sorted(
        [{**v, "debit": round(v["debit"], 2), "credit": round(v["credit"], 2)} for v in totals.values()],
        key=lambda x: x["code"],
    )


def profit_and_loss(db: Session, company_id: int, date_from: Optional[date] = None, date_to: Optional[date] = None) -> dict:
    tb = trial_balance(db, company_id, date_from, date_to)
    income = sum(r["credit"] - r["debit"] for r in tb if r["type"] == "income")
    expenses = sum(r["debit"] - r["credit"] for r in tb if r["type"] == "expense")
    return {
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "net": round(income - expenses, 2),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "rows": [r for r in tb if r["type"] in ("income", "expense")],
    }


def balance_sheet(db: Session, company_id: int, as_of: Optional[date] = None) -> dict:
    tb = trial_balance(db, company_id, None, as_of)
    assets = sum(r["debit"] - r["credit"] for r in tb if r["type"] == "asset")
    liabilities = sum(r["credit"] - r["debit"] for r in tb if r["type"] == "liability")
    equity = sum(r["credit"] - r["debit"] for r in tb if r["type"] == "equity")
    pl = profit_and_loss(db, company_id, None, as_of)
    equity_with_pl = equity + pl["net"]
    return {
        "assets": round(assets, 2),
        "liabilities": round(liabilities, 2),
        "equity": round(equity_with_pl, 2),
        "as_of": as_of.isoformat() if as_of else None,
        "rows": [r for r in tb if r["type"] in ("asset", "liability", "equity")],
    }


def cash_flow(db: Session, company_id: int, date_from: Optional[date] = None, date_to: Optional[date] = None) -> dict:
    ensure_default_coa(db, company_id)
    bank_codes = {"1110", "1120"}
    bank_ids = {
        a.id
        for a in db.query(Account).filter(Account.company_id == company_id, Account.code.in_(bank_codes)).all()
    }
    q = (
        db.query(JournalEntry)
        .options(joinedload(JournalEntry.lines).joinedload(JournalLine.account))
        .filter(JournalEntry.company_id == company_id)
    )
    if date_from:
        q = q.filter(JournalEntry.entry_date >= date_from)
    if date_to:
        q = q.filter(JournalEntry.entry_date <= date_to)
    operating_in = 0.0
    operating_out = 0.0
    rows = []
    for entry in q.order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc()).all():
        for line in entry.lines or []:
            if line.account_id not in bank_ids:
                continue
            debit = float(line.debit or 0)
            credit = float(line.credit or 0)
            if debit > 0:
                operating_in += debit
                rows.append(
                    {
                        "date": entry.entry_date.isoformat(),
                        "reference": entry.reference,
                        "memo": entry.memo,
                        "direction": "in",
                        "amount": round(debit, 2),
                        "source_type": entry.source_type,
                    }
                )
            if credit > 0:
                operating_out += credit
                rows.append(
                    {
                        "date": entry.entry_date.isoformat(),
                        "reference": entry.reference,
                        "memo": entry.memo,
                        "direction": "out",
                        "amount": round(credit, 2),
                        "source_type": entry.source_type,
                    }
                )
    return {
        "inflows": round(operating_in, 2),
        "outflows": round(operating_out, 2),
        "net": round(operating_in - operating_out, 2),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "rows": rows,
    }


def general_ledger(
    db: Session,
    company_id: int,
    *,
    account_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 500,
) -> list[dict]:
    ensure_default_coa(db, company_id)
    q = (
        db.query(JournalLine, JournalEntry, Account)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .filter(JournalEntry.company_id == company_id)
    )
    if account_id:
        q = q.filter(JournalLine.account_id == account_id)
    if date_from:
        q = q.filter(JournalEntry.entry_date >= date_from)
    if date_to:
        q = q.filter(JournalEntry.entry_date <= date_to)
    rows = q.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc()).limit(limit).all()
    out = []
    for line, entry, acct in rows:
        out.append(
            {
                "entry_id": entry.id,
                "date": entry.entry_date.isoformat(),
                "reference": entry.reference,
                "memo": entry.memo,
                "source_type": entry.source_type,
                "source_id": entry.source_id,
                "account_id": acct.id,
                "account_code": acct.code,
                "account_name": acct.name,
                "debit": round(float(line.debit or 0), 2),
                "credit": round(float(line.credit or 0), 2),
            }
        )
    return out


def ar_aging(db: Session, company_id: int, as_of: Optional[date] = None) -> dict:
    from app.services.invoice_payment_service import invoice_balance_due

    as_of = as_of or date.today()
    invoices = (
        db.query(Invoice)
        .options(joinedload(Invoice.client))
        .filter(Invoice.company_id == company_id, Invoice.status.notin_(["draft", "cancelled", "paid"]))
        .all()
    )
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    rows = []
    for inv in invoices:
        bal = invoice_balance_due(db, inv)
        if bal <= 0:
            continue
        due = inv.due_date or inv.invoice_date or as_of
        days = (as_of - due).days
        if days <= 0:
            key = "current"
        elif days <= 30:
            key = "1_30"
        elif days <= 60:
            key = "31_60"
        elif days <= 90:
            key = "61_90"
        else:
            key = "90_plus"
        buckets[key] += bal
        rows.append(
            {
                "invoice_id": inv.id,
                "client": inv.client.name if inv.client else "—",
                "due_date": due.isoformat() if due else None,
                "days_overdue": max(0, days),
                "balance": round(bal, 2),
                "bucket": key,
            }
        )
    return {
        "as_of": as_of.isoformat(),
        "buckets": {k: round(v, 2) for k, v in buckets.items()},
        "total": round(sum(buckets.values()), 2),
        "rows": sorted(rows, key=lambda r: -r["days_overdue"]),
    }


def ap_aging(db: Session, company_id: int, as_of: Optional[date] = None) -> dict:
    as_of = as_of or date.today()
    expenses = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.payment_status.in_(["pending", "overdue"]),
        )
        .all()
    )
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    rows = []
    for exp in expenses:
        bal = float(exp.total_amount or 0)
        if bal <= 0:
            continue
        due = exp.expense_date or as_of
        days = (as_of - due).days
        if days <= 0:
            key = "current"
        elif days <= 30:
            key = "1_30"
        elif days <= 60:
            key = "31_60"
        elif days <= 90:
            key = "61_90"
        else:
            key = "90_plus"
        buckets[key] += bal
        rows.append(
            {
                "expense_id": exp.id,
                "vendor": exp.vendor_name or "—",
                "expense_date": due.isoformat() if due else None,
                "days_outstanding": max(0, days),
                "balance": round(bal, 2),
                "bucket": key,
            }
        )
    return {
        "as_of": as_of.isoformat(),
        "buckets": {k: round(v, 2) for k, v in buckets.items()},
        "total": round(sum(buckets.values()), 2),
        "rows": sorted(rows, key=lambda r: -r["days_outstanding"]),
    }


def create_account(db: Session, company_id: int, data: dict) -> Account:
    ensure_default_coa(db, company_id)
    code = (data.get("code") or "").strip()
    name = (data.get("name") or "").strip()
    account_type = (data.get("account_type") or "").strip().lower()
    if not code or not name or account_type not in ("asset", "liability", "equity", "income", "expense"):
        raise ValueError("Code, name and account type are required")
    if db.query(Account).filter(Account.company_id == company_id, Account.code == code).first():
        raise ValueError("Account code already exists")
    parent_id = data.get("parent_id")
    level = 1
    if parent_id:
        parent = db.query(Account).filter(Account.id == parent_id, Account.company_id == company_id).first()
        if not parent:
            raise ValueError("Parent account not found")
        level = min(3, int(parent.level or 1) + 1)
    row = Account(
        company_id=company_id,
        code=code,
        name=name,
        account_type=account_type,
        parent_id=parent_id,
        level=level,
        is_system=False,
        status=data.get("status") or "active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_account(db: Session, company_id: int, account_id: int, data: dict) -> Account:
    row = db.query(Account).filter(Account.id == account_id, Account.company_id == company_id).first()
    if not row:
        raise ValueError("Account not found")
    if "name" in data and data["name"]:
        row.name = data["name"].strip()
    if "status" in data and data["status"] in ("active", "inactive"):
        row.status = data["status"]
    if not row.is_system:
        if data.get("code"):
            code = data["code"].strip()
            clash = (
                db.query(Account)
                .filter(Account.company_id == company_id, Account.code == code, Account.id != account_id)
                .first()
            )
            if clash:
                raise ValueError("Account code already exists")
            row.code = code
        if data.get("account_type") in ("asset", "liability", "equity", "income", "expense"):
            row.account_type = data["account_type"]
    db.commit()
    db.refresh(row)
    return row


def run_fixed_expenses(db: Session) -> dict:
    today = date.today()
    created = 0
    rows = db.query(FixedExpense).filter(FixedExpense.status == "active").all()
    for fe in rows:
        if not fe.next_run or fe.next_run > today:
            continue
        if fe.end_date and fe.next_run > fe.end_date:
            fe.status = "ended"
            continue
        vat = round(float(fe.amount or 0) * float(fe.vat_rate or 0) / 100.0, 2)
        total = round(float(fe.amount or 0) + vat, 2)
        vendor_name = None
        if fe.vendor_id:
            from app.models import Vendor

            v = db.query(Vendor).filter(Vendor.id == fe.vendor_id).first()
            vendor_name = v.name if v else None
        exp = Expense(
            company_id=fe.company_id,
            expense_date=fe.next_run,
            category=fe.category,
            vendor_id=fe.vendor_id,
            vendor_name=vendor_name,
            description=fe.description,
            amount_ex_vat=fe.amount,
            vat_amount=vat,
            total_amount=total,
            payment_status="pending",
        )
        db.add(exp)
        db.flush()
        try:
            post_expense(db, fe.company_id, exp)
        except Exception:
            pass
        y, m = fe.next_run.year, fe.next_run.month
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1
        day = min(fe.day_of_month or 1, 28)
        fe.next_run = date(y, m, day)
        created += 1
    db.commit()
    return {"created": created}


def run_recurring_invoices(db: Session) -> dict:
    import json
    from app.models import Site, User
    from app.schemas import InvoiceCreate, InvoiceLineBase
    from app.services import invoice_service

    today = date.today()
    created = 0
    rows = db.query(RecurringInvoice).filter(RecurringInvoice.status == "active").all()
    for ri in rows:
        if not ri.next_run or ri.next_run > today:
            continue
        if ri.end_date and ri.next_run > ri.end_date:
            ri.status = "ended"
            continue
        try:
            lines_raw = json.loads(ri.template_json or "[]")
        except Exception:
            lines_raw = []
        site_id = ri.site_id
        if not site_id and ri.client_id:
            site = db.query(Site).filter(Site.client_id == ri.client_id, Site.company_id == ri.company_id).first()
            site_id = site.id if site else None
        lines = []
        for ln in lines_raw:
            sid = ln.get("site_id") or site_id
            if not sid:
                continue
            hours = float(ln.get("hours") or 0)
            rate = float(ln.get("rate") or 0)
            amount = float(ln.get("amount") or (hours * rate))
            lines.append(
                InvoiceLineBase(
                    site_id=int(sid),
                    description=ln.get("description") or "Service",
                    hours=hours,
                    rate=rate,
                    amount=amount,
                    quantity=float(ln.get("quantity") or 1),
                )
            )
        if not lines or not ri.client_id:
            continue
        admin = db.query(User).filter(User.company_id == ri.company_id).order_by(User.id.asc()).first()
        if not admin:
            continue
        try:
            data = InvoiceCreate(
                client_id=ri.client_id,
                period_start=ri.next_run,
                period_end=ri.next_run,
                tax_rate=ri.tax_rate or 20,
                notes=ri.notes,
                lines=lines,
            )
            inv = invoice_service.create_invoice(db, data, admin.id)
            inv.status = "issued"
            db.commit()
            ri.last_invoice_id = inv.id
            try:
                post_invoice_issued(db, ri.company_id, inv)
            except Exception:
                pass
        except Exception:
            continue
        y, m = ri.next_run.year, ri.next_run.month
        if ri.frequency == "weekly":
            ri.next_run = ri.next_run + timedelta(days=7)
        elif ri.frequency == "quarterly":
            m += 3
            if m > 12:
                y += 1
                m -= 12
            ri.next_run = date(y, m, min(ri.day_of_month or 1, 28))
        else:
            if m == 12:
                y, m = y + 1, 1
            else:
                m += 1
            ri.next_run = date(y, m, min(ri.day_of_month or 1, 28))
        created += 1
    db.commit()
    return {"created": created}
