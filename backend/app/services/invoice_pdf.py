from io import BytesIO
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import Company, Invoice, InvoiceLine, Client, Site, Guard, User, Payment
from app.services.company_profile_service import account_bank_lines, has_account_bank_details
from app.services.invoice_payment_service import invoice_amount_paid
from app.storage_paths import resolve_storage_path


def _money(v: float) -> str:
    return f"£{float(v):,.2f}"


def _company_contact(company: Company, admin: Optional[User]) -> tuple[str, str, str]:
    email = (company.email or "").strip() or (admin.email if admin else "") or "—"
    phone = (company.phone or "").strip() or "—"
    address = (company.address or "").strip() or "—"
    return email, phone, address


def render_invoice_pdf(
    db: Session,
    inv: Invoice,
    company: Company,
    client: Client,
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
    title_style = ParagraphStyle(
        "InvTitle",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=6,
    )
    story = []

    logo_resolved = resolve_storage_path(company.logo_path)
    if logo_resolved:
        try:
            img = RLImage(logo_resolved, width=4 * cm, height=2 * cm, kind="proportional")
            story.append(img)
            story.append(Spacer(1, 8))
        except Exception:
            pass

    email, phone, address = _company_contact(company, admin)
    story.append(Paragraph(company.name or "Company", title_style))
    contact_lines = [x for x in [email if email != "—" else None, phone if phone != "—" else None, address if address != "—" else None] if x]
    for line in contact_lines:
        story.append(Paragraph(line.replace("\n", "<br/>"), styles["Normal"]))
    if (company.registration_number or "").strip():
        story.append(Paragraph(f"Registered in England &amp; Wales No. {company.registration_number.strip()}", styles["Normal"]))
    if (company.vat_number or "").strip():
        story.append(Paragraph(f"VAT Registration No. {company.vat_number.strip()}", styles["Normal"]))
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"<b>Invoice</b> #{inv.id}", styles["Heading2"]))
    story.append(Spacer(1, 12))

    meta_data = [
        ["Bill to", client.name],
        ["Contact", client.contact_person or "—"],
        ["Address", client.address or "—"],
        ["Email", client.email or "—"],
        ["Phone", client.phone or "—"],
        ["Period", f"{inv.period_start} – {inv.period_end}"],
        ["Due date", str(inv.due_date) if inv.due_date else "—"],
        ["Status", (inv.status or "draft").title()],
    ]
    t_meta = Table([[a, str(b)] for a, b in meta_data], colWidths=[3 * cm, 12 * cm])
    t_meta.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(t_meta)
    story.append(Spacer(1, 16))

    site_ids = list({ln.site_id for ln in lines})
    site_map = {s.id: s for s in db.query(Site).filter(Site.id.in_(site_ids)).all()} if site_ids else {}
    guard_map = {}
    gids = [ln.guard_id for ln in lines if ln.guard_id]
    if gids:
        for g in db.query(Guard).filter(Guard.id.in_(gids)).all():
            guard_map[g.id] = g

    hdr = ["Site", "Guard", "Hours", "Rate", "Amount"]
    data = [hdr]
    for ln in lines:
        site = site_map.get(ln.site_id)
        g = guard_map.get(ln.guard_id) if ln.guard_id else None
        data.append(
            [
                (site.name if site else f"#{ln.site_id}")[:40],
                (g.full_name if g else "—")[:32],
                f"{ln.hours or 0:.2f}",
                _money(ln.rate or 0),
                _money(ln.amount or 0),
            ]
        )

    tw = [5 * cm, 4 * cm, 2 * cm, 2.5 * cm, 2.5 * cm]
    t_lines = Table(data, colWidths=tw, repeatRows=1)
    t_lines.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(t_lines)
    story.append(Spacer(1, 16))

    paid = invoice_amount_paid(db, inv.id)
    balance = round(max(0, float(inv.total or 0) - paid), 2)
    sums = [
        ["Subtotal", _money(inv.subtotal or 0)],
        [f"Tax ({inv.tax_rate or 0:.1f}%)", _money(inv.tax_amount or 0)],
        ["Total", _money(inv.total or 0)],
    ]
    if paid > 0:
        sums.extend([["Amount paid", _money(paid)], ["Balance due", _money(balance)]])
    st = Table(sums, colWidths=[12 * cm, 4 * cm])
    st.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.black),
                ("TOPPADDING", (0, -1), (-1, -1), 6),
            ]
        )
    )
    story.append(st)

    payments = (
        db.query(Payment)
        .filter(Payment.invoice_id == inv.id)
        .order_by(Payment.paid_at.desc())
        .all()
    )
    if payments:
        story.append(Spacer(1, 14))
        story.append(Paragraph("<b>Payment history</b>", styles["Heading3"]))
        pay_data = [["Date", "Method", "Amount"]]
        for p in payments:
            pay_data.append(
                [
                    str(p.paid_at) if p.paid_at else "—",
                    (p.method or "—").title(),
                    _money(p.amount or 0),
                ]
            )
        t_pay = Table(pay_data, colWidths=[4 * cm, 4 * cm, 4 * cm])
        t_pay.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("ALIGN", (2, 1), (2, -1), "RIGHT"),
                ]
            )
        )
        story.append(t_pay)

    if inv.notes:
        story.append(Spacer(1, 14))
        story.append(Paragraph("<b>Notes</b>", styles["Heading3"]))
        story.append(Paragraph((inv.notes or "").replace("\n", "<br/>"), styles["Normal"]))

    if has_account_bank_details(company):
        story.append(Spacer(1, 20))
        story.append(Paragraph("<b>Account details — please pay to</b>", styles["Heading3"]))
        bank_data = [[label, value] for label, value in account_bank_lines(company)]
        t_bank = Table(bank_data, colWidths=[4 * cm, 11 * cm])
        t_bank.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(t_bank)

    doc.build(story)
    return buf.getvalue()
