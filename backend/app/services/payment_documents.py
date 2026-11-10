"""Client payment receipts and vendor remittance advices.

Both are the same one-page document: the company's logo and details, who the payment was
for, the amount and method, a stamp, and the "Powered by ControlOps" footer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import Optional
from xml.sax.saxutils import escape

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.html_safe import esc_map
from app.models import Company, Expense, Invoice, Payment, User
from app.services.invoice_currency import INVOICE_CURRENCIES
from app.services.invoice_pdf import _company_contact, _long_date
from app.services.invoice_payment_service import invoice_balance_due

GREEN = "#15803D"
AMBER = "#B45309"


@dataclass
class _Document:
    company: Company
    admin: Optional[User]
    title: str
    reference: str
    party_line: str
    party_detail: str
    paid_on: object
    amount_text: str
    method_label: str
    stamp: str
    stamp_color: str
    closing_note: str
    balance_text: Optional[str] = None
    table: list[list[str]] = field(default_factory=list)


def _money(amount: float, currency: Optional[str]) -> str:
    code = (currency or "GBP").upper()
    return f"{INVOICE_CURRENCIES.get(code, code + ' ')}{float(amount):,.2f}"


def _method_label(method: Optional[str]) -> str:
    return (method or "").replace("_", " ").strip().upper() or "NOT RECORDED"


def _render(d: _Document) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    from app.services.pdf_branding import branded_bottom_margin, build_branded, company_logo_flowable

    class Stamp(Flowable):
        def __init__(self, text: str, color: str):
            super().__init__()
            self.text, self.color = text, colors.HexColor(color)
            self.w = 34 + 14 * len(text)
            self.h = 42
            self.hAlign = "CENTER"

        def wrap(self, *_):
            return self.w, self.h

        def draw(self):
            c = self.canv
            c.setStrokeColor(self.color)
            c.setFillColor(self.color)
            c.setLineWidth(2.5)
            c.roundRect(1, 1, self.w - 2, self.h - 2, 5)
            c.setFont("Helvetica-Bold", 22)
            c.drawCentredString(self.w / 2, 13, self.text)

    def style(name: str, size: float, leading: float, color: str = "#52525B", bold: bool = False):
        return ParagraphStyle(
            name,
            fontName="Helvetica-Bold" if bold else "Helvetica",
            fontSize=size,
            leading=leading,
            alignment=TA_CENTER,
            textColor=colors.HexColor(color),
        )

    dark = "#1F1F1F"
    title = style("Title", 22, 27, dark, True)
    strong = style("Strong", 12, 16, dark, True)
    body = style("Body", 10, 14)
    small = style("Small", 9, 12.5)
    amount = style("Amount", 15, 20, dark, True)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=3 * cm,
        rightMargin=3 * cm,
        topMargin=1.6 * cm,
        bottomMargin=branded_bottom_margin(1.2 * cm),
    )
    width = A4[0] - 6 * cm
    rule = Table([[""]], colWidths=[width], rowHeights=[1])
    rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.6, colors.HexColor("#E4E4E7"))]))

    story: list = []
    logo = company_logo_flowable(d.company, 4.2 * cm, 3.2 * cm)
    if logo is not None:
        logo.hAlign = "CENTER"
        story += [logo, Spacer(1, 12)]
    story.append(Paragraph(escape(d.title), title))
    story.append(Paragraph(escape(d.reference), strong))
    story.append(Spacer(1, 4))
    story.append(Paragraph(escape(d.party_line), body))
    if d.party_detail.strip():
        story.append(Paragraph(escape(d.party_detail).replace("\n", "<br/>"), small))
    story.append(Paragraph(f"paid on {escape(_long_date(d.paid_on))}", body))
    story.append(Spacer(1, 14))

    email, phone, address = _company_contact(d.company, d.admin)
    story.append(Paragraph(escape((d.company.name or "Company").upper()), strong))
    for bit in (address, phone, email, (getattr(d.company, "website", None) or "").strip()):
        if bit and bit != "—":
            story.append(Paragraph(escape(bit).replace("\n", "<br/>"), small))

    story += [Spacer(1, 16), rule, Spacer(1, 14)]
    story.append(Paragraph(f"Payment Amount: {escape(d.amount_text)}", amount))
    if d.balance_text:
        story.append(Paragraph(f"Balance remaining: {escape(d.balance_text)}", body))
    story += [Spacer(1, 6), rule, Spacer(1, 10)]
    story.append(Paragraph(f"<b>PAYMENT METHOD:</b> {escape(d.method_label)}", small))

    if d.table:
        rows = [
            [Paragraph(escape(cell), style(f"Cell{i}{j}", 9, 12, dark, i == 0)) for j, cell in enumerate(row)]
            for i, row in enumerate(d.table)
        ]
        grid = Table(rows, colWidths=[width * 0.3, width * 0.42, width * 0.28], repeatRows=1)
        grid.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F4F4F5")),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#E4E4E7")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story += [Spacer(1, 12), grid]

    story += [Spacer(1, 20), Stamp(d.stamp, d.stamp_color), Spacer(1, 20)]
    story.append(Paragraph(escape(d.closing_note), small))

    build_branded(doc, story, powered_by=True)
    return buf.getvalue()


def _admin(db: Session, company: Company) -> Optional[User]:
    return db.query(User).filter(User.id == company.admin_id).first()


def _billed_party(inv: Invoice) -> tuple[str, str]:
    """Name and email the invoice is addressed to; a client-less invoice bills its site."""
    if inv.client:
        return inv.client.name or "—", (inv.client.email or "").strip()
    site = next((ln.site for ln in inv.lines if getattr(ln, "site", None)), None)
    if site:
        return site.name or "—", (site.contact_email or "").strip()
    return "—", ""


def receipt_filename(inv: Invoice) -> str:
    return f"receipt-invoice-{inv.id}.pdf"


def remittance_filename(exp: Expense) -> str:
    return f"remittance-{exp.id}.pdf"


def _invoice_payments(db: Session, inv: Invoice) -> list[Payment]:
    payments = (
        db.query(Payment)
        .filter(Payment.invoice_id == inv.id, Payment.deleted_at.is_(None))
        .order_by(Payment.paid_at.asc(), Payment.id.asc())
        .all()
    )
    if not payments:
        raise HTTPException(
            status_code=400,
            detail="No payment has been recorded on this invoice. Record the payment first.",
        )
    return payments


def render_invoice_receipt(db: Session, inv: Invoice) -> bytes:
    payments = _invoice_payments(db, inv)
    received = round(sum(float(p.amount or 0) for p in payments), 2)
    balance = invoice_balance_due(db, inv)
    code = (inv.currency or "GBP").upper()
    methods = {_method_label(p.method) for p in payments}
    company = inv.company
    admin = _admin(db, company)
    email, _phone, _address = _company_contact(company, admin)
    table: list[list[str]] = []
    if len(payments) > 1:
        table = [["Date", "Method", "Amount"]] + [
            [
                p.paid_at.strftime("%d/%m/%Y") if p.paid_at else "—",
                _method_label(p.method).title(),
                _money(p.amount or 0, code),
            ]
            for p in payments
        ]
    fully_paid = balance <= 0
    return _render(
        _Document(
            company=company,
            admin=admin,
            title="Payment Receipt",
            reference=f"Invoice #{inv.id}",
            party_line=f"for {_billed_party(inv)[0]}",
            party_detail="",
            paid_on=payments[-1].paid_at,
            amount_text=f"{_money(received, code)} {code}",
            balance_text=None if fully_paid else f"{_money(balance, code)} {code}",
            method_label=methods.pop() if len(methods) == 1 else "MULTIPLE",
            stamp="PAID" if fully_paid else "PART PAID",
            stamp_color=GREEN if fully_paid else AMBER,
            closing_note=f"Thanks for your business. If you have any questions about this receipt, please contact {email}.",
            table=table,
        )
    )


def _assert_remittable(exp: Expense) -> None:
    if exp.payment_status != "paid":
        raise HTTPException(status_code=400, detail="A remittance can only be issued for a paid expense")
    if not (exp.vendor_name or "").strip():
        raise HTTPException(status_code=400, detail="Add a vendor to this expense first")


def _remittance_reference(exp: Expense) -> str:
    return (exp.reference_number or "").strip() or f"EXP-{exp.id}"


def render_remittance(db: Session, exp: Expense) -> bytes:
    _assert_remittable(exp)
    company = db.query(Company).filter(Company.id == exp.company_id).first()
    admin = _admin(db, company)
    email, _phone, _address = _company_contact(company, admin)
    total = _money(exp.total_amount or 0, "GBP")
    reference = _remittance_reference(exp)
    return _render(
        _Document(
            company=company,
            admin=admin,
            title="Remittance Advice",
            reference=f"Reference {reference}",
            party_line=f"to {exp.vendor_name.strip()}",
            party_detail=(exp.vendor.address or "") if exp.vendor else "",
            paid_on=exp.paid_on or exp.expense_date,
            amount_text=f"{total} GBP",
            method_label=_method_label(exp.payment_method),
            stamp="PAID",
            stamp_color=GREEN,
            closing_note=f"This advice confirms the payment above. If you have any questions, please contact {email}.",
            table=[
                ["Reference", "Description", "Amount"],
                [reference, (exp.description or exp.category or "—").strip(), total],
                ["", "Total inc VAT", total],
            ],
        )
    )


def _email_body(company: Company, template_key: str, context: dict) -> str:
    from app.services import email_config_service

    template = email_config_service.parse_templates(company.email_templates_json)[template_key]
    try:
        return template.format(**esc_map(context))
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=400, detail="This email template is invalid. Check it in Email settings.")


def send_invoice_receipt(db: Session, invoice_id: int, user_id: int, to: Optional[str]) -> str:
    from app.services import email_config_service, invoice_service

    inv = invoice_service.get_invoice(db, invoice_id, user_id)
    pdf = render_invoice_receipt(db, inv)
    recipient = (to or _billed_party(inv)[1] or "").strip()
    if not recipient:
        raise HTTPException(status_code=400, detail="There is no email address on record. Enter one to send the receipt.")
    code = (inv.currency or "GBP").upper()
    received = round(sum(float(p.amount or 0) for p in _invoice_payments(db, inv)), 2)
    body = _email_body(inv.company, "payment_receipt", {"invoice_id": inv.id, "amount": _money(received, code)})
    email_config_service.send_tenant_email(
        db, user_id, recipient, f"Payment receipt — invoice #{inv.id}", body, "payment_receipt",
        [(receipt_filename(inv), pdf)],
    )
    invoice_service.log_invoice_audit(db, inv.company_id, user_id, inv.id, "receipt_sent", {"recipient": recipient})
    db.commit()
    return recipient


def send_remittance(db: Session, expense_id: int, user_id: int, to: Optional[str]) -> str:
    from app.services import email_config_service, expense_service

    exp = expense_service._get_expense(db, expense_id, user_id)
    pdf = render_remittance(db, exp)
    on_record = (exp.vendor.email or "").strip() if exp.vendor else ""
    recipient = (to or on_record).strip()
    if not recipient:
        raise HTTPException(status_code=400, detail="There is no email address on record. Enter one to send the remittance.")
    company = db.query(Company).filter(Company.id == exp.company_id).first()
    reference = _remittance_reference(exp)
    body = _email_body(
        company, "remittance_advice", {"amount": _money(exp.total_amount or 0, "GBP"), "reference": reference}
    )
    email_config_service.send_tenant_email(
        db, user_id, recipient, f"Remittance advice — {reference}", body, "remittance_advice",
        [(remittance_filename(exp), pdf)],
    )
    return recipient
