from datetime import date
from io import BytesIO
import os
from typing import List, Optional

from PIL import Image
from sqlalchemy.orm import Session

from app.models import Company, Invoice, InvoiceLine, Client, Site, Guard, User, Payment
from app.services.company_profile_service import account_bank_lines, has_account_bank_details
from app.services.invoice_payment_service import invoice_amount_paid
from app.services.image_avif_service import AVIF_EXT
from app.storage_paths import resolve_storage_path


def _money(v: float) -> str:
    return f"£{float(v):,.2f}"


def _company_contact(company: Company, admin: Optional[User]) -> tuple[str, str, str]:
    email = (company.email or "").strip() or (admin.email if admin else "") or "—"
    phone = (company.phone or "").strip() or "—"
    address = (company.address or "").strip() or "—"
    return email, phone, address


ACCENT_HEX = "#F45100"
NAVY_HEX = "#0F172A"
SOFT_HEX = "#FFF4ED"
PANEL_HEX = "#F1F5F9"


def _group_lines_by_day(lines, site_map) -> list:
    """Roll invoice lines up per day, the way the bill is read.

    Mirrors groupInvoiceLines() in lib/invoice-lines.ts. Undated lines (allowances and
    anything entered by hand) keep a row each, after the work, since a flat charge has no
    day, no operatives and no hours to report.
    """
    by_date: dict = {}
    undated: list = []
    for ln in lines:
        if ln.shift_date:
            by_date.setdefault(ln.shift_date, []).append(ln)
        else:
            undated.append(ln)

    rows = []
    for day in sorted(by_date):
        group = by_date[day]
        hours = sum(float(l.hours or 0) for l in group)
        amount = sum(float(l.amount or 0) for l in group)
        rates = {round(float(l.rate or 0), 4) for l in group}
        uniform = next(iter(rates)) if len(rates) == 1 else None
        rows.append(
            {
                "label": day.strftime("%d %B %Y"),
                "site_names": sorted({site_map[l.site_id].name for l in group if l.site_id in site_map}),
                "operatives": len({l.guard_id for l in group if l.guard_id}),
                "hours": round(hours, 2),
                # A single rate cell must never imply an agreed rate that does not exist,
                # so a mixed day reports the blended figure and says so.
                "rate": uniform if uniform is not None else (amount / hours if hours else None),
                "rate_is_blended": uniform is None,
                "amount": round(amount, 2),
            }
        )

    for ln in undated:
        label = ln.description or ("Allowance" if float(ln.allowance_amount or 0) > 0 else "Charge")
        rows.append(
            {
                "label": label,
                "site_names": [],
                "operatives": 0,
                "hours": round(float(ln.hours or 0), 2),
                "rate": float(ln.rate) if ln.rate else None,
                "rate_is_blended": False,
                "amount": round(float(ln.amount or 0), 2),
            }
        )
    return rows


def render_invoice_pdf(
    db: Session,
    inv: Invoice,
    company: Company,
    client: Optional[Client],
    lines: List[InvoiceLine],
    admin: Optional[User] = None,
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import Image as RLImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
    )
    styles = getSampleStyleSheet()
    # The single brand colour the document is built from. One constant, so a tenant's own
    # colour can be swapped in (or read from company settings) without touching layout.
    ACCENT = colors.HexColor(ACCENT_HEX)
    story = []

    # Held rather than appended: the header places it beside the company details.
    logo_flowable = None
    logo_resolved = resolve_storage_path(company.logo_path)
    if logo_resolved:
        try:
            ext = os.path.splitext(logo_resolved)[1].lower()
            if ext == AVIF_EXT:
                avif_buf = BytesIO()
                Image.open(logo_resolved).save(avif_buf, format="PNG")
                avif_buf.seek(0)
                logo_flowable = RLImage(avif_buf, width=3.4 * cm, height=1.8 * cm, kind="proportional")
            else:
                logo_flowable = RLImage(logo_resolved, width=3.4 * cm, height=1.8 * cm, kind="proportional")
        except Exception:
            logo_flowable = None

    # ── Header: identity left, the word INVOICE right, on one rule ──────────────
    name_style = ParagraphStyle("CoName", parent=styles["Normal"], fontSize=13, leading=16, fontName="Helvetica-Bold")
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, leading=11, textColor=colors.HexColor("#475569"))
    word_style = ParagraphStyle("InvWord", parent=styles["Normal"], fontSize=26, leading=28, fontName="Helvetica-Bold", alignment=2)

    email, phone, address = _company_contact(company, admin)
    left_cell = []
    if logo_flowable is not None:
        left_cell.append(logo_flowable)
        left_cell.append(Spacer(1, 6))
    left_cell.append(Paragraph((company.name or "Company").upper(), name_style))
    for bit in (address, phone, email):
        if bit and bit != "—":
            left_cell.append(Paragraph(bit.replace("\n", "<br/>"), small))

    right_cell = [Paragraph("INVOICE", word_style)]
    t_head = Table([[left_cell, right_cell]], colWidths=[11.5 * cm, 6.5 * cm])
    t_head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(t_head)
    story.append(Spacer(1, 4))
    rule = Table([[""]], colWidths=[18 * cm], rowHeights=[2.5])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(rule)
    story.append(Spacer(1, 14))

    # An invoice raised against a site that belongs to no client has no customer record.
    # The site's own name and contact details are what the bill is addressed to instead.
    bill_site = None
    if client is None:
        for ln in lines:
            if getattr(ln, "site", None):
                bill_site = ln.site
                break
    bill_to = client.name if client else (bill_site.name if bill_site else "—")
    bill_contact = (client.contact_person if client else (bill_site.contact_person if bill_site else None)) or ""
    bill_address = (client.address if client else (bill_site.address if bill_site else None)) or ""
    bill_email = (client.email if client else (bill_site.contact_email if bill_site else None)) or ""
    bill_phone = (client.phone if client else (bill_site.contact_phone if bill_site else None)) or ""

    label_style = ParagraphStyle("Lbl", parent=styles["Normal"], fontSize=8, fontName="Helvetica-Bold", textColor=ACCENT)
    billee_style = ParagraphStyle("Billee", parent=styles["Normal"], fontSize=11, leading=14, fontName="Helvetica-Bold")

    bill_cell = [Paragraph("BILL TO", label_style), Spacer(1, 4), Paragraph(bill_to.upper(), billee_style)]
    for bit in (bill_contact, bill_address, bill_phone, bill_email):
        if bit:
            bill_cell.append(Paragraph(str(bit).replace("\n", "<br/>"), small))

    paid = invoice_amount_paid(db, inv.id)
    from app.services.invoice_payment_service import invoice_credit_applied, invoice_balance_due

    credited = invoice_credit_applied(db, inv.id)
    balance = invoice_balance_due(db, inv)
    amount_due = balance if (paid > 0 or credited > 0) else float(inv.total or 0)

    inv_date = inv.invoice_date or (inv.created_at.date() if inv.created_at else None)
    meta_rows = [
        ["Invoice Number:", f"#{inv.id}"],
        ["Invoice Date:", inv_date.strftime("%d %B %Y") if inv_date else "—"],
        ["Payment Due:", inv.due_date.strftime("%d %B %Y") if inv.due_date else "—"],
        ["Invoice Period:", f"{inv.period_start.strftime('%d %B %Y') if inv.period_start else '—'} to {inv.period_end.strftime('%d %B %Y') if inv.period_end else '—'}"],
    ]
    if getattr(inv, "po_number", None):
        meta_rows.append(["PO Number:", inv.po_number])
    meta_rows.append(["Status:", (inv.status or "draft").title()])
    t_meta_inner = Table(meta_rows, colWidths=[3.4 * cm, 4.6 * cm])
    t_meta_inner.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#e2e8f0")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    t_due = Table([["Amount Due (GBP):", _money(amount_due)]], colWidths=[4.4 * cm, 3.6 * cm])
    t_due.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(SOFT_HEX)),
        ("TEXTCOLOR", (0, 0), (0, 0), ACCENT),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (0, 0), 9),
        ("FONTSIZE", (1, 0), (1, 0), 13),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    t_top = Table([[bill_cell, [t_meta_inner, Spacer(1, 6), t_due]]], colWidths=[9 * cm, 9 * cm])
    t_top.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor(PANEL_HEX)),
        ("LEFTPADDING", (0, 0), (0, 0), 10),
        ("RIGHTPADDING", (0, 0), (0, 0), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(t_top)
    story.append(Spacer(1, 16))

    site_ids = list({ln.site_id for ln in lines})
    site_map = {s.id: s for s in db.query(Site).filter(Site.id.in_(site_ids)).all()} if site_ids else {}
    cell = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=7.5, leading=9)
    cell_muted = ParagraphStyle("CellMuted", parent=styles["Normal"], fontSize=6.5, leading=8, textColor=colors.HexColor("#64748b"))
    hdr = ["DATE", "DESCRIPTION", "SHIFT TIMING", "OPS", "HOURS", "RATE", "AMOUNT"]
    data = [hdr]
    for ln in sorted(lines, key=lambda x: (x.shift_date is None, x.shift_date or date.min, x.id)):
        site = site_map.get(ln.site_id)
        title = ln.description or (site.name if site else "Service")
        detail = ln.service_detail or (site.name if site and ln.description else "")
        desc_bits = [Paragraph(str(title), cell)]
        if detail:
            desc_bits.append(Paragraph(str(detail), cell_muted))
        start = (ln.shift_start or "").strip()
        end = (ln.shift_end or "").strip()
        timing = f"{start} - {end}" if start and end else (start or end or "—")
        qty = ln.quantity if ln.quantity is not None else (1 if ln.guard_id else 0)
        hours = float(ln.hours or 0)
        rate = float(ln.rate or 0)
        data.append([
            ln.shift_date.strftime("%d %b %Y") if ln.shift_date else "—",
            desc_bits,
            timing,
            f"{qty:g}" if qty else "—",
            f"{hours:g}" if hours else "—",
            _money(rate) if rate else "—",
            _money(ln.amount or 0),
        ])
    tw = [2.6 * cm, 4.6 * cm, 2.6 * cm, 1.4 * cm, 1.8 * cm, 2.4 * cm, 2.6 * cm]
    t_lines = Table(data, colWidths=tw, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (3, 1), (3, -1), "CENTER"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor(PANEL_HEX)))
    t_lines.setStyle(TableStyle(style_cmds))
    story.append(t_lines)
    story.append(Spacer(1, 14))

    notes_text = (inv.notes or "Payment is due within 30 days of the invoice date.\nPlease quote the invoice number as your payment reference.\nThank you for your business.").replace("\n", "<br/>")
    notes_cell = [Paragraph("NOTES / TERMS", label_style), Spacer(1, 4), Paragraph(notes_text, small)]
    if getattr(inv, "rota_review", None):
        notes_cell.extend([
            Spacer(1, 8),
            Paragraph("ROTA REVIEW", ParagraphStyle("Rr", parent=label_style, textColor=colors.HexColor("#64748b"))),
            Spacer(1, 2),
            Paragraph(str(inv.rota_review).replace("\n", "<br/>"), small),
        ])
    notes_box = Table([[notes_cell]], colWidths=[9 * cm])
    notes_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(PANEL_HEX)),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    sums = [["Subtotal:", _money(inv.subtotal or 0)], [f"VAT {inv.tax_rate or 0:g}%:", _money(inv.tax_amount or 0)]]
    if paid > 0:
        sums.append(["Amount paid:", _money(paid)])
    if credited > 0:
        sums.append(["Credits applied:", _money(credited)])
    t_sums = Table(sums, colWidths=[4.6 * cm, 3.4 * cm])
    t_sums.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    t_total = Table(
        [["Balance Due (GBP):" if (paid > 0 or credited > 0) else "Total Due (GBP):", _money(amount_due)]],
        colWidths=[4.6 * cm, 3.4 * cm],
    )
    t_total.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(SOFT_HEX)),
        ("TEXTCOLOR", (0, 0), (0, 0), ACCENT),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (0, 0), 9),
        ("FONTSIZE", (1, 0), (1, 0), 13),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    st = Table([[notes_box, [t_sums, Spacer(1, 4), t_total]]], colWidths=[9.5 * cm, 8.5 * cm])
    st.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(st)

    payments = db.query(Payment).filter(Payment.invoice_id == inv.id).order_by(Payment.paid_at.desc()).all()
    if payments:
        story.append(Spacer(1, 14))
        story.append(Paragraph("<b>Payment history</b>", styles["Heading3"]))
        pay_data = [["Date", "Method", "Amount"]]
        for p in payments:
            pay_data.append([str(p.paid_at) if p.paid_at else "—", (p.method or "—").title(), _money(p.amount or 0)])
        t_pay = Table(pay_data, colWidths=[4 * cm, 4 * cm, 4 * cm])
        t_pay.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("ALIGN", (2, 1), (2, -1), "RIGHT"),
        ]))
        story.append(t_pay)

    from app.models import CreditNote

    credits = (
        db.query(CreditNote)
        .filter(CreditNote.invoice_id == inv.id, CreditNote.status == "issued")
        .order_by(CreditNote.credit_date.desc())
        .all()
    )
    if credits:
        story.append(Spacer(1, 14))
        story.append(Paragraph("<b>Credit notes</b>", styles["Heading3"]))
        cn_data = [["Date", "Number", "Reason", "Amount"]]
        for cn in credits:
            cn_data.append(
                [
                    cn.credit_date.isoformat() if cn.credit_date else "—",
                    cn.number or f"CN-{cn.id}",
                    (cn.reason or "—")[:40],
                    _money(cn.total or 0),
                ]
            )
        t_cn = Table(cn_data, colWidths=[3 * cm, 3 * cm, 6 * cm, 3 * cm])
        t_cn.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("ALIGN", (3, 1), (3, -1), "RIGHT"),
        ]))
        story.append(t_cn)

    payee_account_name = getattr(inv, "payee_account_name", None) or company.account_name
    payee_bank_name = getattr(inv, "payee_bank_name", None) or company.bank_name
    payee_sort = getattr(inv, "payee_sort_code", None) or company.sort_code
    payee_number = getattr(inv, "payee_account_number", None) or company.account_number
    payee_iban = getattr(inv, "payee_iban", None) or company.iban
    payee_swift = getattr(inv, "payee_swift_code", None) or company.swift_code
    has_payee = any([(payee_account_name or "").strip(), (payee_bank_name or "").strip(), (payee_sort or "").strip(), (payee_number or "").strip(), (payee_iban or "").strip()])
    if has_payee:
        story.append(Spacer(1, 18))
        pay_label = ParagraphStyle("PayLbl", parent=styles["Normal"], fontSize=9, fontName="Helvetica-Bold", textColor=colors.white)
        pay_sub = ParagraphStyle("PaySub", parent=styles["Normal"], fontSize=8, leading=11, textColor=colors.HexColor("#cbd5e1"))
        left_bits = [Paragraph("PAYMENT DETAILS", pay_label)]
        if (payee_bank_name or "").strip():
            left_bits.append(Paragraph(payee_bank_name.strip(), pay_label))
        if (payee_account_name or "").strip():
            left_bits.append(Paragraph(f"Account Name: {payee_account_name.strip()}", pay_sub))
        boxes = []
        for label, value in (("Account Number", (payee_number or "").strip()), ("Sort Code", (payee_sort or "").strip()), ("Payment Ref", f"INV-{inv.id}")):
            if not value:
                continue
            box = Table([[Paragraph(label.upper(), pay_sub)], [Paragraph(value, pay_label)]], colWidths=[3.8 * cm])
            box.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1e293b")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]))
            boxes.append(box)
        right_cell = Table([boxes], colWidths=[4.1 * cm] * len(boxes)) if boxes else ""
        band = Table([[left_bits, right_cell]], colWidths=[7.5 * cm, 10.5 * cm])
        band.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(NAVY_HEX)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBEFORE", (0, 0), (0, 0), 3, ACCENT),
            ("LEFTPADDING", (0, 0), (0, 0), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(band)
        fake = type("C", (), {"iban": payee_iban, "swift_code": payee_swift})()
        for label, value in account_bank_lines(fake):
            story.append(Paragraph(f"<font size=7 color='#64748b'>{label}: {value}</font>", styles["Normal"]))

    story.append(Spacer(1, 16))
    foot_left = []
    if (company.vat_number or "").strip():
        foot_left.append(f"VAT Registration Number: {company.vat_number.strip()}")
    if (company.registration_number or "").strip():
        foot_left.append(f"Company Registration Number: {company.registration_number.strip()}")
    foot_style = ParagraphStyle("Foot", parent=styles["Normal"], fontSize=7.5, leading=10, textColor=colors.HexColor("#64748b"))
    brand_style = ParagraphStyle("Brand", parent=styles["Normal"], fontSize=9, fontName="Helvetica-Bold", alignment=1, textColor=colors.HexColor("#334155"))
    t_foot = Table([
        [Paragraph("<br/>".join(foot_left) or " ", foot_style), Paragraph("ControlOps", brand_style), Paragraph(f"Invoice #{inv.id}", foot_style)]
    ], colWidths=[6.5 * cm, 5 * cm, 6.5 * cm])
    t_foot.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
    ]))
    story.append(t_foot)

    doc.build(story)
    return buf.getvalue()
