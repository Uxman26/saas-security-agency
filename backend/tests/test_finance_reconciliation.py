"""Invoice settlement, status, and recycle-bin consistency — isolated tenant rows."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import Client, Company, CreditNote, Invoice, Payment
from app.services.credit_note_service import invoice_credit_applied
from app.services.invoice_payment_service import (
    invoice_amount_paid,
    invoice_balance_due,
    sync_invoice_payment_status,
)
from app.services.invoice_service import recalc_invoice_totals

MARKER = "FINAUDIT-TEST"


def _company_id(db) -> int | None:
    row = db.query(Company.id).order_by(Company.id.asc()).first()
    return int(row[0]) if row else None


def _cleanup(db, company_id: int) -> None:
    db.rollback()
    db.expunge_all()
    inv_ids = [
        r[0]
        for r in db.query(Invoice.id).filter(Invoice.company_id == company_id, Invoice.notes == MARKER).all()
    ]
    if inv_ids:
        db.query(Payment).filter(Payment.invoice_id.in_(inv_ids)).delete(synchronize_session=False)
        db.query(CreditNote).filter(CreditNote.invoice_id.in_(inv_ids)).delete(synchronize_session=False)
        db.query(Invoice).filter(Invoice.id.in_(inv_ids)).delete(synchronize_session=False)
    db.commit()


def _invoice(db, company_id: int, *, total: float = 120.0, status: str = "sent") -> Invoice:
    today = date.today()
    inv = Invoice(
        company_id=company_id,
        period_start=today - timedelta(days=7),
        period_end=today,
        invoice_date=today,
        due_date=today + timedelta(days=14),
        notes=MARKER,
        subtotal=100.0,
        tax_rate=20.0,
        tax_amount=20.0,
        total=total,
        status=status,
    )
    db.add(inv)
    db.flush()
    return inv


def test_invoice_vat_and_balance_reconcile():
    db = SessionLocal()
    try:
        cid = _company_id(db)
        if cid is None:
            return
        _cleanup(db, cid)
        inv = _invoice(db, cid)
        recalc_invoice_totals(db, inv)
        db.commit()
        assert inv.subtotal == 100.0
        assert inv.tax_amount == 20.0
        assert inv.total == 120.0
        assert invoice_balance_due(db, inv) == 120.0

        pay = Payment(company_id=cid, invoice_id=inv.id, amount=40.0)
        db.add(pay)
        db.flush()
        cn = CreditNote(
            company_id=cid,
            invoice_id=inv.id,
            number="CN-FINAUDIT",
            credit_date=date.today(),
            subtotal=25.0,
            tax_rate=20.0,
            tax_amount=5.0,
            total=30.0,
            status="issued",
        )
        db.add(cn)
        db.commit()
        assert invoice_amount_paid(db, inv.id) == 40.0
        assert invoice_credit_applied(db, inv.id) == 30.0
        assert invoice_balance_due(db, inv) == 50.0
        sync_invoice_payment_status(db, inv)
        assert inv.status == "partial"
    finally:
        cid = _company_id(db)
        if cid:
            _cleanup(db, cid)
        db.close()


def test_status_leaves_partial_when_settlements_removed():
    db = SessionLocal()
    try:
        cid = _company_id(db)
        if cid is None:
            return
        _cleanup(db, cid)
        inv = _invoice(db, cid)
        pay = Payment(company_id=cid, invoice_id=inv.id, amount=40.0)
        db.add(pay)
        db.commit()
        sync_invoice_payment_status(db, inv)
        assert inv.status == "partial"
        pay.deleted_at = datetime.now(timezone.utc)
        db.commit()
        sync_invoice_payment_status(db, inv)
        assert inv.status == "sent"
        assert invoice_balance_due(db, inv) == 120.0

        inv.due_date = date.today() - timedelta(days=1)
        db.commit()
        sync_invoice_payment_status(db, inv)
        assert inv.status == "overdue"

        draft = CreditNote(
            company_id=cid,
            invoice_id=inv.id,
            number="CN-FINAUDIT-DRAFT",
            credit_date=date.today(),
            subtotal=120.0,
            tax_rate=0,
            tax_amount=0,
            total=120.0,
            status="draft",
        )
        db.add(draft)
        db.commit()
        assert invoice_credit_applied(db, inv.id) == 0.0
        cancelled = CreditNote(
            company_id=cid,
            invoice_id=inv.id,
            number="CN-FINAUDIT-CX",
            credit_date=date.today(),
            subtotal=10.0,
            tax_rate=0,
            tax_amount=0,
            total=10.0,
            status="cancelled",
        )
        db.add(cancelled)
        db.commit()
        assert invoice_credit_applied(db, inv.id) == 0.0
    finally:
        cid = _company_id(db)
        if cid:
            _cleanup(db, cid)
        db.close()


def test_dashboard_outstanding_excludes_drafts_and_uses_remaining():
    from app.services.report_service import get_dashboard_stats

    db = SessionLocal()
    try:
        company = db.query(Company).order_by(Company.id.asc()).first()
        if company is None or not company.admin_id:
            return
        cid = int(company.id)
        admin_id = int(company.admin_id)
        _cleanup(db, cid)
        before = get_dashboard_stats(db, admin_id, company_id=cid)

        draft = _invoice(db, cid, total=1000.0, status="draft")
        draft.subtotal = 1000.0
        draft.tax_rate = 0
        draft.tax_amount = 0
        open_inv = _invoice(db, cid, total=120.0, status="sent")
        db.add(Payment(company_id=cid, invoice_id=open_inv.id, amount=40.0))
        db.commit()

        after = get_dashboard_stats(db, admin_id, company_id=cid)
        assert after.invoice_total == round(before.invoice_total + 120.0, 2)
        assert after.invoice_outstanding == round(before.invoice_outstanding + 80.0, 2)
    finally:
        cid = _company_id(db)
        if cid:
            _cleanup(db, cid)
        db.close()


def test_deleted_payments_are_excluded_from_paid_total():
    db = SessionLocal()
    try:
        cid = _company_id(db)
        if cid is None:
            return
        _cleanup(db, cid)
        inv = _invoice(db, cid)
        live = Payment(company_id=cid, invoice_id=inv.id, amount=25.0)
        gone = Payment(company_id=cid, invoice_id=inv.id, amount=80.0, deleted_at=datetime.now(timezone.utc))
        db.add_all([live, gone])
        db.commit()
        assert invoice_amount_paid(db, inv.id) == 25.0
        assert invoice_balance_due(db, inv) == 95.0
    finally:
        cid = _company_id(db)
        if cid:
            _cleanup(db, cid)
        db.close()


def test_statement_excludes_draft_payments():
    from app.services.invoice_statement_service import build_statement

    db = SessionLocal()
    try:
        company = db.query(Company).order_by(Company.id.asc()).first()
        if company is None or not company.admin_id:
            return
        client = db.query(Client).filter(Client.company_id == company.id).first()
        if client is None:
            return
        cid = int(company.id)
        admin_id = int(company.admin_id)
        _cleanup(db, cid)
        draft = _invoice(db, cid, total=100.0, status="draft")
        draft.client_id = client.id
        issued = _invoice(db, cid, total=120.0, status="sent")
        issued.client_id = client.id
        db.add(Payment(company_id=cid, invoice_id=draft.id, amount=18.0))
        db.add(Payment(company_id=cid, invoice_id=issued.id, amount=40.0))
        db.commit()
        today = date.today()
        data = build_statement(
            db,
            admin_id,
            client_id=client.id,
            site_id=None,
            date_from=today - timedelta(days=30),
            date_to=today + timedelta(days=1),
            statement_type="all",
        )
        assert data["summary"]["invoiced"] == 120.0
        assert data["summary"]["paid"] == 40.0
        payment_items = [l["item"] for l in data["lines"] if l.get("kind") == "payment"]
        assert all(f"#{draft.id}" not in item for item in payment_items)
    finally:
        cid = _company_id(db)
        if cid:
            _cleanup(db, cid)
        db.close()


def test_cancelled_recurring_and_unused_account_can_be_deleted():
    from app.models import Account, RecurringInvoice
    from app.services.accounting_service import delete_account

    db = SessionLocal()
    try:
        cid = _company_id(db)
        if cid is None:
            return
        today = date.today()
        rec = RecurringInvoice(
            company_id=cid,
            frequency="monthly",
            day_of_month=1,
            start_date=today,
            next_run=today + timedelta(days=30),
            notes=MARKER,
            template_json="[]",
            status="cancelled",
        )
        db.add(rec)
        acc = Account(
            company_id=cid,
            code="FINAUDIT99",
            name=MARKER,
            account_type="expense",
            level=3,
            is_system=False,
            status="inactive",
        )
        db.add(acc)
        db.commit()
        rid, aid = rec.id, acc.id
        db.delete(rec)
        db.commit()
        assert db.query(RecurringInvoice).filter(RecurringInvoice.id == rid).first() is None
        delete_account(db, cid, aid)
        assert db.query(Account).filter(Account.id == aid).first() is None
    finally:
        cid = _company_id(db)
        if cid:
            from app.models import Account, RecurringInvoice

            db.query(RecurringInvoice).filter(RecurringInvoice.notes == MARKER).delete(synchronize_session=False)
            db.query(Account).filter(Account.name == MARKER).delete(synchronize_session=False)
            db.commit()
            _cleanup(db, cid)
        db.close()
