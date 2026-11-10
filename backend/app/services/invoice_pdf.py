from datetime import date
from io import BytesIO
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import Company, Invoice, InvoiceLine, Client, Site, Guard, User, Payment
from app.services.invoice_payment_service import invoice_amount_paid


def _money(v: float) -> str:
    return f"£{float(v):,.2f}"


def _company_contact(company: Company, admin: Optional[User]) -> tuple[str, str, str]:
    email = (company.email or "").strip() or (admin.email if admin else "") or "—"
    phone = (company.phone or "").strip() or "—"
    address = (company.address or "").strip() or "—"
    return email, phone, address


ACCENT_HEX = "#D7141A"
DARK_HEX = "#1F1F1F"
NAVY_HEX = DARK_HEX  # statement PDF still imports the old name
SOFT_HEX = "#FDECEC"
PANEL_HEX = "#F4F4F5"
DEFAULT_DESCRIPTION = "security services"
EDGE_BAND = 11  # height in points of the charcoal strips at the top and bottom of the page


def _long_date(d) -> str:
    return d.strftime("%d %B %Y") if d else "—"


def _hours(v: float) -> str:
    return f"{round(float(v), 2):g}"


def _draw_edge_bands(canvas, doc) -> None:
    """Charcoal strip across the top and bottom of every page with a slanted red end."""
    from reportlab.lib import colors

    w, h = doc.pagesize
    dark = colors.HexColor(DARK_HEX)
    red = colors.HexColor(ACCENT_HEX)
    red_w = w * 0.28
    slant = EDGE_BAND * 2.2
    canvas.saveState()
    canvas.setFillColor(dark)
    canvas.rect(0, h - EDGE_BAND, w, EDGE_BAND, stroke=0, fill=1)
    canvas.setFillColor(red)
    p = canvas.beginPath()
    p.moveTo(0, h)
    p.lineTo(red_w + slant, h)
    p.lineTo(red_w, h - EDGE_BAND)
    p.lineTo(0, h - EDGE_BAND)
    p.close()
    canvas.drawPath(p, stroke=0, fill=1)

    # Bottom strip sits just above the "Powered by ControlOps" banner.
    y = 44
    canvas.setFillColor(dark)
    canvas.rect(0, y, w, EDGE_BAND, stroke=0, fill=1)
    canvas.setFillColor(red)
    p = canvas.beginPath()
    p.moveTo(w - red_w, y + EDGE_BAND)
    p.lineTo(w, y + EDGE_BAND)
    p.lineTo(w, y)
    p.lineTo(w - red_w - slant, y)
    p.close()
    canvas.drawPath(p, stroke=0, fill=1)
    canvas.restoreState()


def _numbered_canvas_class():
    """Canvas that knows the page count, so each page can say "Page X of Y"."""
    from reportlab.pdfgen import canvas as rl_canvas

    class NumberedCanvas(rl_canvas.Canvas):
        footer_ref = ""

        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._saved = []

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._saved)
            for state in self._saved:
                self.__dict__.update(state)
                w, _h = self._pagesize
                self.saveState()
                self.setFont("Helvetica", 7.5)
                self.setFillColorRGB(1, 1, 1)
                self.drawRightString(w - 18, 44 + 3.2, f"{self.footer_ref}  |  Page {self._pageNumber} of {total}")
                self.restoreState()
                super().showPage()
            super().save()

    return NumberedCanvas


def _line_timing(ln):
    start = (ln.shift_start or "").strip()
    end = (ln.shift_end or "").strip()
    if start and end:
        return f"{start} - {end}"
    return start or end or None


def _group_lines_by_day(lines, site_map) -> list:
    """One row per kind of shift on a day (date, description, timing, rate, site).

    Mirrors groupInvoiceLines() in lib/invoice-lines.ts. Undated lines (allowances and
    anything entered by hand) keep a row each, after the work, since a flat charge has no
    day, no operatives and no hours to report.
    """
    groups: dict = {}
    undated: list = []
    for ln in lines:
        if ln.shift_date:
            key = (
                ln.shift_date,
                (ln.description or "").strip().lower(),
                _line_timing(ln) or "",
                round(float(ln.rate or 0), 4),
                ln.site_id or 0,
            )
            groups.setdefault(key, []).append(ln)
        else:
            undated.append(ln)

    rows = []
    ordered = sorted(groups.values(), key=lambda g: (g[0].shift_date, (g[0].shift_start or "")))
    for group in ordered:
        first = group[0]
        day = first.shift_date
        hours = sum(float(l.hours or 0) for l in group)
        amount = sum(float(l.amount or 0) for l in group)
        guards = len({l.guard_id for l in group if l.guard_id})
        qty = sum(float(l.quantity or 1) for l in group)
        rows.append(
            {
                "shift_date": day,
                "label": day.strftime("%d/%m/%Y"),
                "site_names": sorted({site_map[l.site_id].name for l in group if l.site_id in site_map}),
                "operatives": int(max(guards, qty)) or len(group),
                "hours": round(hours, 2),
                "rate": float(first.rate or 0),
                "rate_is_blended": False,
                "amount": round(amount, 2),
                "timing": _line_timing(first) or "—",
                "description": (first.description or "").strip() or "Security services",
            }
        )

    for ln in undated:
        label = ln.description or ("Allowance" if float(ln.allowance_amount or 0) > 0 else "Charge")
        rows.append(
            {
                "shift_date": None,
                "label": label,
                "site_names": [site_map[ln.site_id].name] if ln.site_id in site_map else [],
                "operatives": 0,
                "hours": round(float(ln.hours or 0), 2),
                "rate": float(ln.rate) if ln.rate else None,
                "rate_is_blended": False,
                "amount": round(float(ln.amount or 0), 2),
                "timing": _line_timing(ln) or "—",
                "description": label,
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
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    from app.services.pdf_branding import branded_bottom_margin, build_branded, company_logo_flowable

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1.2 * cm + EDGE_BAND,
        bottomMargin=branded_bottom_margin(1.2 * cm) + EDGE_BAND,
    )
    styles = getSampleStyleSheet()
    ACCENT = colors.HexColor(ACCENT_HEX)
    DARK = colors.HexColor(DARK_HEX)
    PANEL = colors.HexColor(PANEL_HEX)
    SOFT = colors.HexColor(SOFT_HEX)
    LINE = colors.HexColor("#e4e4e7")
    story = []

    logo_flowable = company_logo_flowable(company, 3.0 * cm, 2.6 * cm)

    # ── Header: logo | company details | divider | INVOICE ───────────────────────
    name_style = ParagraphStyle("CoName", parent=styles["Normal"], fontSize=13, leading=16, fontName="Helvetica-Bold", textColor=DARK)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, leading=11, textColor=colors.HexColor("#52525b"))
    word_style = ParagraphStyle("InvWord", parent=styles["Normal"], fontSize=28, leading=30, fontName="Helvetica-Bold", textColor=DARK)

    email, phone, address = _company_contact(company, admin)
    details = [Paragraph((company.name or "Company").upper(), name_style), Spacer(1, 3)]
    for bit in (address, phone, email, (getattr(company, "website", None) or "").strip()):
        if bit and bit != "—":
            details.append(Paragraph(bit.replace("\n", "<br/>"), small))

    underline = Table([[""]], colWidths=[4.2 * cm], rowHeights=[4])
    underline.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    word_cell = [Paragraph("INVOICE", word_style), Spacer(1, 4), underline]

    if logo_flowable is not None:
        head_row = [logo_flowable, details, word_cell]
        head_w = [3.4 * cm, 8.4 * cm, 6.2 * cm]
    else:
        head_row = [details, word_cell]
        head_w = [11.8 * cm, 6.2 * cm]
    t_head = Table([head_row], colWidths=head_w)
    t_head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (-1, 0), (-1, 0), 18),
        ("LINEBEFORE", (-1, 0), (-1, 0), 0.6, LINE),
    ]))
    story.append(t_head)
    story.append(Spacer(1, 16))

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
    billee_style = ParagraphStyle("Billee", parent=styles["Normal"], fontSize=11, leading=14, fontName="Helvetica-Bold", textColor=DARK)

    bill_cell = [Paragraph("BILL TO", label_style), Spacer(1, 4), Paragraph(bill_to.upper(), billee_style)]
    for bit in (bill_contact, bill_address):
        if bit:
            bill_cell.append(Paragraph(str(bit).replace("\n", "<br/>"), small))
    if bill_phone or bill_email:
        bill_cell.append(Spacer(1, 8))
        for bit in (bill_phone, bill_email):
            if bit:
                bill_cell.append(Paragraph(str(bit), small))

    paid = invoice_amount_paid(db, inv.id)
    from app.services.invoice_payment_service import invoice_credit_applied, invoice_balance_due

    credited = invoice_credit_applied(db, inv.id)
    balance = invoice_balance_due(db, inv)
    amount_due = balance if (paid > 0 or credited > 0) else float(inv.total or 0)

    inv_date = inv.invoice_date or (inv.created_at.date() if inv.created_at else None)
    meta_rows = [
        ["Invoice Number:", f"#{inv.id}"],
        ["Invoice Date:", _long_date(inv_date)],
        ["Payment Due:", _long_date(inv.due_date)],
        ["Purchase Order:", (getattr(inv, "po_number", None) or "").strip()],
    ]
    t_meta_inner = Table(meta_rows, colWidths=[3.4 * cm, 4.6 * cm])
    t_meta_inner.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), DARK),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    due_label = "Balance Due (GBP):" if (paid > 0 or credited > 0) else "Amount Due (GBP):"
    t_due = Table([[due_label, _money(amount_due)]], colWidths=[4.0 * cm, 4.0 * cm])
    t_due.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("TEXTCOLOR", (0, 0), (0, 0), ACCENT),
        ("TEXTCOLOR", (1, 0), (1, 0), DARK),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (0, 0), 9),
        ("FONTSIZE", (1, 0), (1, 0), 14),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    meta_box = Table([[[t_meta_inner, Spacer(1, 8), t_due]]], colWidths=[8.6 * cm])
    meta_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    t_top = Table([[bill_cell, "", meta_box]], colWidths=[9.0 * cm, 0.4 * cm, 8.6 * cm])
    t_top.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, 0), PANEL),
        ("LEFTPADDING", (0, 0), (0, 0), 12),
        ("RIGHTPADDING", (0, 0), (0, 0), 12),
        ("TOPPADDING", (0, 0), (0, 0), 12),
        ("BOTTOMPADDING", (0, 0), (0, 0), 12),
        ("LEFTPADDING", (1, 0), (-1, 0), 0),
        ("RIGHTPADDING", (1, 0), (-1, 0), 0),
        ("TOPPADDING", (1, 0), (-1, 0), 0),
        ("BOTTOMPADDING", (1, 0), (-1, 0), 0),
    ]))
    story.append(t_top)
    story.append(Spacer(1, 18))

    # ── Lines: Date | Operatives | Hours | Timings | Rate | Amount ───────────────
    site_ids = list({ln.site_id for ln in lines if ln.site_id})
    site_map = {s.id: s for s in db.query(Site).filter(Site.id.in_(site_ids)).all()} if site_ids else {}
    cell = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=8.5, leading=10.5, textColor=DARK)
    cell_bold = ParagraphStyle("CellB", parent=cell, fontName="Helvetica-Bold")
    cell_muted = ParagraphStyle("CellMuted", parent=styles["Normal"], fontSize=7, leading=9, textColor=colors.HexColor("#71717a"))
    hdr = {
        "date": "DATE",
        "operatives": "OPERATIVES",
        "hours": "HOURS",
        "shift_timing": "TIMINGS",
        "rate": "RATE",
        "amount": "AMOUNT",
    }
    headers_json = getattr(inv, "column_headers_json", None)
    if headers_json:
        try:
            import json as _json
            custom = _json.loads(headers_json) if isinstance(headers_json, str) else headers_json
            if isinstance(custom, dict):
                hdr = {k: str(custom.get(k) or v).upper() for k, v in hdr.items()}
        except Exception:
            pass

    rows = _group_lines_by_day(lines, site_map)
    multi_site = len({n for r in rows for n in r["site_names"]}) > 1
    data = [[
        hdr["date"],
        hdr["operatives"],
        hdr["hours"],
        hdr["shift_timing"],
        hdr["rate"],
        hdr["amount"],
    ]]
    for row in rows:
        dated = row.get("shift_date") is not None
        desc = (row.get("description") or "").strip()
        detail = []
        if dated and desc and desc.lower() != DEFAULT_DESCRIPTION:
            detail.append(desc)
        if multi_site and row["site_names"]:
            detail.append(", ".join(row["site_names"]))
        first = [Paragraph(_long_date(row["shift_date"]) if dated else (desc or row["label"]), cell if dated else cell_bold)]
        if detail:
            first.append(Paragraph(" · ".join(detail), cell_muted))
        hours = float(row["hours"] or 0)
        rate = row["rate"]
        ops = int(row["operatives"] or 0)
        timing = row.get("timing") or "—"
        data.append([
            first,
            str(ops) if ops else "—",
            _hours(hours) if hours else "—",
            timing,
            _money(float(rate)) if rate is not None else "—",
            _money(row["amount"] or 0),
        ])
    if len(data) == 1:
        data.append([Paragraph("No line items", cell_muted), "", "", "", "", ""])
    t_lines = Table(
        data,
        colWidths=[4.6 * cm, 2.4 * cm, 2.2 * cm, 3.0 * cm, 2.6 * cm, 3.2 * cm],
        repeatRows=1,
    )
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (1, 1), (-1, -1), DARK),
        ("ALIGN", (1, 0), (4, -1), "CENTER"),
        ("ALIGN", (5, 0), (5, -1), "RIGHT"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), PANEL))
    t_lines.setStyle(TableStyle(style_cmds))
    story.append(t_lines)
    story.append(Spacer(1, 14))

    # ── Notes (only when set) and totals panel ──────────────────────────────────
    notes_cell = []
    if (inv.notes or "").strip():
        notes_cell += [Paragraph("NOTES", label_style), Spacer(1, 4), Paragraph(inv.notes.strip().replace("\n", "<br/>"), small)]
    if (getattr(inv, "rota_review", None) or "").strip():
        if notes_cell:
            notes_cell.append(Spacer(1, 8))
        notes_cell += [
            Paragraph("ROTA REVIEW", ParagraphStyle("Rr", parent=label_style, textColor=colors.HexColor("#71717a"))),
            Spacer(1, 2),
            Paragraph(str(inv.rota_review).strip().replace("\n", "<br/>"), small),
        ]
    if notes_cell:
        notes_box = Table([[notes_cell]], colWidths=[9 * cm])
        notes_box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PANEL),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
    else:
        notes_box = ""

    sums = [["Subtotal:", _money(inv.subtotal or 0)], [f"VAT {inv.tax_rate or 0:g}%:", _money(inv.tax_amount or 0)]]
    t_sums = Table(sums, colWidths=[4.0 * cm, 3.6 * cm])
    t_sums.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, -1), DARK),
        ("LINEBELOW", (0, -1), (-1, -1), 0.4, LINE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    t_total = Table([["TOTAL DUE (GBP):", _money(inv.total or 0)]], colWidths=[3.8 * cm, 3.8 * cm])
    t_total.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("TEXTCOLOR", (0, 0), (0, 0), ACCENT),
        ("TEXTCOLOR", (1, 0), (1, 0), DARK),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (0, 0), 9),
        ("FONTSIZE", (1, 0), (1, 0), 14),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    totals_bits = [t_sums, Spacer(1, 8), t_total]
    if paid > 0 or credited > 0:
        extra = []
        if paid > 0:
            extra.append(["Amount paid:", _money(paid)])
        if credited > 0:
            extra.append(["Credits applied:", _money(credited)])
        extra.append(["Balance due:", _money(balance)])
        t_extra = Table(extra, colWidths=[4.0 * cm, 3.6 * cm])
        t_extra.setStyle(TableStyle([
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, -1), (-1, -1), ACCENT),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        totals_bits += [Spacer(1, 6), t_extra]
    totals_box = Table([[totals_bits]], colWidths=[8.4 * cm])
    totals_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    st = Table([[notes_box, totals_box]], colWidths=[9.6 * cm, 8.4 * cm])
    st.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(st)

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
                    cn.credit_date.strftime("%d/%m/%Y") if cn.credit_date else "—",
                    cn.number or f"CN-{cn.id}",
                    (cn.reason or "—")[:40],
                    _money(cn.total or 0),
                ]
            )
        t_cn = Table(cn_data, colWidths=[3 * cm, 3 * cm, 6 * cm, 3 * cm])
        t_cn.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PANEL),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.25, LINE),
            ("ALIGN", (3, 1), (3, -1), "RIGHT"),
        ]))
        story.append(t_cn)

    # ── Payment details card ────────────────────────────────────────────────────
    payee_account_name = getattr(inv, "payee_account_name", None) or company.account_name
    payee_bank_name = getattr(inv, "payee_bank_name", None) or company.bank_name
    payee_sort = getattr(inv, "payee_sort_code", None) or company.sort_code
    payee_number = getattr(inv, "payee_account_number", None) or company.account_number
    payee_iban = getattr(inv, "payee_iban", None) or company.iban
    payee_swift = getattr(inv, "payee_swift_code", None) or company.swift_code
    has_payee = any([(payee_account_name or "").strip(), (payee_bank_name or "").strip(), (payee_sort or "").strip(), (payee_number or "").strip(), (payee_iban or "").strip()])
    if has_payee:
        story.append(Spacer(1, 18))
        pay_title = ParagraphStyle("PayT", parent=styles["Normal"], fontSize=10, leading=13, fontName="Helvetica-Bold", textColor=colors.white)
        pay_label = ParagraphStyle("PayLbl", parent=styles["Normal"], fontSize=9, leading=12, fontName="Helvetica-Bold", textColor=colors.white)
        pay_value = ParagraphStyle("PayVal", parent=styles["Normal"], fontSize=12, leading=15, fontName="Helvetica-Bold", textColor=colors.white)
        pay_sub = ParagraphStyle("PaySub", parent=styles["Normal"], fontSize=7.5, leading=10, textColor=colors.HexColor("#d4d4d8"))
        left_bits = [Paragraph("PAYMENT DETAILS", pay_title), Spacer(1, 3)]
        if (payee_bank_name or "").strip():
            left_bits.append(Paragraph(payee_bank_name.strip(), pay_label))
        if (payee_account_name or "").strip():
            left_bits.append(Paragraph(f"Account Name: {payee_account_name.strip()}", pay_sub))
        bar = Table([[left_bits]], colWidths=[8.2 * cm])
        bar.setStyle(TableStyle([
            ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ]))
        boxes = []
        for label, value in (("Account No.", (payee_number or "").strip()), ("Sort Code", (payee_sort or "").strip())):
            if not value:
                continue
            box = Table([[Paragraph(label, pay_sub)], [Paragraph(value, pay_value)]], colWidths=[3.8 * cm])
            box.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#333333")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ]))
            boxes.append(box)
        right_cell = Table([boxes], colWidths=[4.0 * cm] * len(boxes)) if boxes else ""
        band = Table([[bar, right_cell]], colWidths=[9.6 * cm, 8.4 * cm])
        band.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), DARK),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (0, 0), 14),
            ("TOPPADDING", (0, 0), (-1, -1), 14),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(band)
        for label, value in (("IBAN", (payee_iban or "").strip()), ("SWIFT / BIC", (payee_swift or "").strip())):
            if not value:
                continue
            story.append(Paragraph(f"<font size=7 color='#71717a'>{label}: {value}</font>", styles["Normal"]))

    # ── Footer: registration numbers left, invoice reference right ──────────────
    story.append(Spacer(1, 16))
    foot_left = []
    if (company.vat_number or "").strip():
        foot_left.append(f"VAT Registration Number: {company.vat_number.strip()}")
    if (company.registration_number or "").strip():
        foot_left.append(f"Company Registration Number: {company.registration_number.strip()}")
    foot_style = ParagraphStyle("Foot", parent=styles["Normal"], fontSize=7.5, leading=10, textColor=colors.HexColor("#52525b"))
    foot_right = ParagraphStyle("FootR", parent=foot_style, alignment=2)
    t_foot = Table(
        [[Paragraph("<br/>".join(foot_left) or " ", foot_style), Paragraph(f"Invoice #{inv.id}", foot_right)]],
        colWidths=[12 * cm, 6 * cm],
    )
    t_foot.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (-1, 0), (-1, 0), 0),
    ]))
    story.append(t_foot)

    canvas_cls = _numbered_canvas_class()
    canvas_cls.footer_ref = f"Invoice #{inv.id}"
    build_branded(doc, story, onFirstPage=_draw_edge_bands, onLaterPages=_draw_edge_bands, canvasmaker=canvas_cls, powered_by=True)
    return buf.getvalue()
