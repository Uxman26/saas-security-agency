"""Branded HTML emails for a client invoice and its payment reminder.

Both share one card: the tenant's logo, the amount, due date and invoice number at the
top, the tenant's own message (the Email settings template) in the middle, then a short
summary of the lines, totals and how to pay. The invoice PDF goes as an attachment.

Built with tables and inline styles only, since that is all email clients render
reliably. The logo travels inside the email (cid:) because the app's logo URL needs a
login that a mail client does not have.
"""
from __future__ import annotations

import base64
from datetime import date, datetime
from html import escape
from io import BytesIO
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Company, Invoice, Site, User
from app.services.invoice_currency import INVOICE_CURRENCIES
from app.services.invoice_ref import invoice_filename, invoice_label, invoice_no
from app.html_safe import esc_map

LOGO_CID = "company-logo"
BRAND = "#F45100"
INK = "#0F172A"
MUTED = "#64748B"
LINE = "#E2E8F0"
PANEL = "#F8FAFC"
DANGER = "#DC2626"
# Rows listed in the email body; a long rota invoice points to the PDF for the rest.
MAX_ROWS = 8


def _money(amount: float, code: str) -> str:
    return f"{INVOICE_CURRENCIES.get(code, code + ' ')}{float(amount):,.2f}"


def _long_date(d: Optional[date]) -> str:
    if not d:
        return ""
    if isinstance(d, datetime):
        d = d.date()
    return f"{d.day} {d.strftime('%b %Y')}"


def logo_png(company: Optional[Company]) -> Optional[bytes]:
    """The tenant's logo as a small PNG, or None when there is none to show."""
    from PIL import Image

    from app.storage_paths import resolve_storage_path

    path = resolve_storage_path(company.logo_path) if company and company.logo_path else None
    if not path:
        return None
    try:
        img = Image.open(path)
        img.thumbnail((480, 192))
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")
        out = BytesIO()
        img.save(out, format="PNG", optimize=True)
        return out.getvalue()
    except Exception:
        return None


def _billed_to(inv: Invoice) -> tuple[str, str]:
    from app.services.payment_documents import _billed_party

    name, email = _billed_party(inv)
    return ("" if name == "—" else name), email


def _payee_rows(inv: Invoice, company: Company) -> list[tuple[str, str]]:
    """Bank details as the invoice PDF prints them: the invoice's own, else the company's."""
    pairs = [
        ("Account name", getattr(inv, "payee_account_name", None) or company.account_name),
        ("Bank", getattr(inv, "payee_bank_name", None) or company.bank_name),
        ("Sort code", getattr(inv, "payee_sort_code", None) or company.sort_code),
        ("Account no.", getattr(inv, "payee_account_number", None) or company.account_number),
        ("IBAN", getattr(inv, "payee_iban", None) or company.iban),
        ("SWIFT / BIC", getattr(inv, "payee_swift_code", None) or company.swift_code),
    ]
    rows = [(k, (v or "").strip()) for k, v in pairs if (v or "").strip()]
    return rows + [("Reference", invoice_no(inv))] if rows else []


def _summary_rows(db: Session, inv: Invoice) -> list[tuple[str, float]]:
    from app.services.invoice_pdf import DEFAULT_DESCRIPTION, _group_lines_by_day

    lines = sorted(inv.lines, key=lambda x: x.id)
    site_ids = {ln.site_id for ln in lines if ln.site_id}
    site_map = {s.id: s for s in db.query(Site).filter(Site.id.in_(site_ids)).all()} if site_ids else {}
    out = []
    for row in _group_lines_by_day(lines, site_map):
        desc = (row.get("description") or "").strip()
        if row.get("shift_date"):
            label = _long_date(row["shift_date"])
            if desc and desc.lower() != DEFAULT_DESCRIPTION:
                label = f"{label} · {desc}"
            elif row.get("hours"):
                label = f"{label} · {row['hours']:g} hrs"
        else:
            label = desc or "Item"
        out.append((label, float(row.get("amount") or 0)))
    return out


def _message_context(inv: Invoice, company: Company, amount: str) -> dict:
    client_name, _ = _billed_to(inv)
    return {
        "invoice_id": invoice_no(inv),
        "invoice_number": invoice_no(inv),
        "amount": amount,
        "due_date": _long_date(inv.due_date),
        "client_name": client_name or "there",
        "company_name": (company.name or "").strip(),
    }


def _render_message(company: Company, template_key: str, context: dict) -> str:
    from app.services import email_config_service

    template = email_config_service.parse_templates(company.email_templates_json)[template_key]
    try:
        return template.format(**esc_map(context))
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=400, detail="This email template is invalid. Check it in Email settings.")


def _row(label: str, value: str, *, bold: bool = False, color: str = INK, top: bool = False) -> str:
    weight = "700" if bold else "400"
    border = f"border-top:1px solid {LINE};" if top else ""
    return (
        f'<tr><td style="padding:8px 0;{border}font-size:14px;color:{MUTED if not bold else INK};font-weight:{weight}">{label}</td>'
        f'<td align="right" style="padding:8px 0;{border}font-size:14px;color:{color};font-weight:{weight};white-space:nowrap">{value}</td></tr>'
    )


def render(
    db: Session,
    inv: Invoice,
    *,
    kind: str,
    balance: Optional[float] = None,
    logo_src: Optional[str] = None,
    today: Optional[date] = None,
) -> dict:
    """Build the email. kind is "invoice" or "reminder".

    logo_src is "cid:company-logo" when sending, a data: URL for an in-app preview, or
    None for no logo. Returns subject, html and the context used for the message.
    """
    from app.services.invoice_payment_service import invoice_settled_amount
    from app.services.invoice_pdf import company_full_address

    company = inv.company
    code = (inv.currency or "GBP").upper()
    total = round(float(inv.total or 0), 2)
    paid = round(invoice_settled_amount(db, inv.id), 2) if inv.id else 0.0
    due_amount = round(balance if balance is not None else max(0.0, total - paid), 2)
    reminder = kind == "reminder"
    headline_amount = due_amount if reminder else total
    amount_text = _money(headline_amount, code)

    ctx = _message_context(inv, company, amount_text)
    message = _render_message(company, "payment_reminder" if reminder else "invoice_sent", ctx)
    subject = f"Payment reminder — {invoice_label(inv)}" if reminder else invoice_label(inv)
    company_name = escape((company.name or "").strip())

    # ── Header: logo, company, badge, amount, due date, invoice number ──
    logo_html = (
        f'<img src="{escape(logo_src)}" alt="{company_name}" style="display:block;margin:0 auto 12px;max-width:200px;max-height:80px;border:0" />'
        if logo_src
        else ""
    )
    badge = ""
    if reminder:
        overdue_days = 0
        if inv.due_date:
            overdue_days = max(0, ((today or date.today()) - inv.due_date).days)
        badge_text = f"OVERDUE · {overdue_days} DAY{'S' if overdue_days != 1 else ''}" if overdue_days else "OVERDUE"
        badge = (
            f'<div style="margin:0 0 14px"><span style="display:inline-block;padding:5px 12px;border:2px solid {DANGER};'
            f'border-radius:4px;color:{DANGER};font-size:12px;font-weight:800;letter-spacing:1.5px">{badge_text}</span></div>'
        )
    amount_label = "Amount overdue" if reminder else "Amount due"
    due_line = f"Due {escape(_long_date(inv.due_date))}" if inv.due_date else ""
    due_color = DANGER if reminder else INK

    # ── Summary of lines and totals ──
    rows = _summary_rows(db, inv)
    shown, hidden = rows[:MAX_ROWS], len(rows) - MAX_ROWS
    line_html = "".join(_row(escape(label), _money(amt, code)) for label, amt in shown)
    if hidden > 0:
        line_html += (
            f'<tr><td colspan="2" style="padding:6px 0 8px;font-size:13px;color:{MUTED}">'
            f"+ {hidden} more line{'s' if hidden != 1 else ''} in the attached PDF</td></tr>"
        )
    totals = _row("Subtotal", _money(float(inv.subtotal or 0), code), top=True)
    if float(inv.tax_amount or 0):
        totals += _row(f"VAT {float(inv.tax_rate or 0):g}%", _money(float(inv.tax_amount or 0), code))
    totals += _row("Total", _money(total, code), bold=True)
    if paid > 0:
        totals += _row("Paid", f"−{_money(paid, code)}")
    totals += _row(
        f"Amount due ({code})", _money(due_amount, code), bold=True, color=DANGER if reminder else INK, top=True
    )

    payee = _payee_rows(inv, company)
    payee_html = ""
    if payee and due_amount > 0:
        cells = "".join(
            f'<tr><td style="padding:3px 0;font-size:13px;color:{MUTED}">{escape(k)}</td>'
            f'<td align="right" style="padding:3px 0;font-size:13px;color:{INK};font-weight:600">{escape(v)}</td></tr>'
            for k, v in payee
        )
        payee_html = (
            f'<tr><td style="padding:0 32px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'style="background:{PANEL};border:1px solid {LINE};border-radius:8px"><tr><td style="padding:14px 16px">'
            f'<div style="font-size:12px;font-weight:700;letter-spacing:1px;color:{BRAND};margin-bottom:6px">HOW TO PAY</div>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{cells}</table>'
            f"</td></tr></table></td></tr>"
        )

    address = escape(company_full_address(company)).replace("\n", "<br>")
    contact = " · ".join(escape(x) for x in [(company.email or "").strip(), (company.phone or "").strip()] if x)

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid {LINE};border-radius:10px;overflow:hidden">
<tr><td style="height:5px;background:{BRAND};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 22px;border-bottom:1px solid {LINE}">
  {logo_html}
  <div style="font-size:16px;font-weight:700;color:{INK};margin-bottom:16px">{company_name}</div>
  {badge}
  <div style="font-size:12px;font-weight:600;letter-spacing:1px;color:{MUTED};text-transform:uppercase">{amount_label}</div>
  <div style="font-size:34px;font-weight:800;color:{INK};margin:4px 0 6px">{escape(amount_text)} <span style="font-size:15px;font-weight:600;color:{MUTED}">{code}</span></div>
  <div style="font-size:15px;font-weight:700;color:{due_color}">{due_line}</div>
  <div style="font-size:13px;color:{MUTED};margin-top:4px">{escape(invoice_label(inv))}</div>
</td></tr>
<tr><td style="padding:24px 32px 8px;font-size:15px;line-height:1.6;color:{INK}">{message}</td></tr>
<tr><td style="padding:8px 32px 20px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:8px 0;border-bottom:2px solid {INK};font-size:12px;font-weight:700;letter-spacing:1px;color:{INK}">DESCRIPTION</td>
        <td align="right" style="padding:8px 0;border-bottom:2px solid {INK};font-size:12px;font-weight:700;letter-spacing:1px;color:{INK}">AMOUNT</td></tr>
    {line_html}
    {totals}
  </table>
</td></tr>
{payee_html}
<tr><td align="center" style="padding:0 32px 26px;font-size:13px;color:{MUTED}">Attached: <strong style="color:{INK}">{escape(invoice_filename(inv))}</strong></td></tr>
<tr><td align="center" style="padding:18px 32px;background:{PANEL};border-top:1px solid {LINE};font-size:12px;line-height:1.6;color:{MUTED}">
  <strong style="color:{INK}">{company_name}</strong><br>{address}{'<br>' + contact if contact else ''}
</td></tr>
</table>
</td></tr></table>
</body></html>"""
    return {"subject": subject, "html": html, "context": ctx}


def build(db: Session, inv: Invoice, *, kind: str, balance: Optional[float] = None, preview: bool = False) -> dict:
    """The email ready to send (or to preview): subject, html, inline logo and the PDF.

    For a preview the logo is a data: URL and no PDF is rendered.
    """
    from app.services.invoice_pdf import render_invoice_pdf

    company = inv.company
    logo = logo_png(company)
    if preview:
        src = f"data:image/png;base64,{base64.b64encode(logo).decode()}" if logo else None
    else:
        src = f"cid:{LOGO_CID}" if logo else None
    out = render(db, inv, kind=kind, balance=balance, logo_src=src)
    out["inline_images"] = [(LOGO_CID, logo)] if logo and not preview else []
    if not preview:
        admin = db.query(User).filter(User.id == company.admin_id).first() if company else None
        lines = sorted(inv.lines, key=lambda x: x.id)
        pdf = render_invoice_pdf(db, inv, company, inv.client, list(lines), admin)
        out["attachments"] = [(invoice_filename(inv), pdf)]
    else:
        out["attachments"] = []
    return out
