from __future__ import annotations

from io import BytesIO
from typing import Any

from app.services.invoice_pdf import ACCENT_HEX, NAVY_HEX, PANEL_HEX, SOFT_HEX


def _money(v: float) -> str:
    return f"£{float(v):,.2f}"


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        y, m, d = iso[:10].split("-")
        months = (
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        )
        return f"{months[int(m) - 1]} {int(d)}, {y}"
    except (ValueError, IndexError):
        return iso


def render_statement_pdf(data: dict[str, Any]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    from app.services.pdf_branding import branded_bottom_margin, build_branded

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1.2 * cm,
        bottomMargin=branded_bottom_margin(1.2 * cm),
    )
    styles = getSampleStyleSheet()
    accent = colors.HexColor(ACCENT_HEX)
    navy = colors.HexColor(NAVY_HEX)
    panel = colors.HexColor(PANEL_HEX)
    soft = colors.HexColor(SOFT_HEX)

    title = ParagraphStyle("StTitle", parent=styles["Normal"], fontSize=20, fontName="Helvetica-Bold", textColor=navy, alignment=2)
    subtitle = ParagraphStyle("StSub", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748b"), alignment=2)
    co_name = ParagraphStyle("CoName", parent=styles["Normal"], fontSize=11, fontName="Helvetica-Bold", textColor=navy)
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=8, leading=11, textColor=colors.HexColor("#334155"))
    label = ParagraphStyle("Lbl", parent=styles["Normal"], fontSize=8, fontName="Helvetica-Bold", textColor=colors.HexColor("#64748b"))
    small = ParagraphStyle("Sm", parent=styles["Normal"], fontSize=7.5, leading=10, textColor=colors.HexColor("#64748b"))

    company = data.get("company") or {}
    client = data.get("client") or {}
    site = data.get("site")
    summary = data.get("summary") or {}
    date_from = data.get("date_from")
    date_to = data.get("date_to")

    story = []
    accent_bar = Table([[""]], colWidths=[18 * cm], rowHeights=[3])
    accent_bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), accent)]))
    story.append(accent_bar)
    story.append(Spacer(1, 10))

    addr_bits = [company.get("address") or "", company.get("postcode") or ""]
    addr = ", ".join(x for x in addr_bits if (x or "").strip()) or "—"
    left = [
        Paragraph((company.get("name") or "Company").upper(), co_name),
        Spacer(1, 2),
        Paragraph(addr.replace("\n", "<br/>"), body),
    ]
    right = [
        Paragraph("Statement of Account", title),
        Paragraph("Account activity", subtitle),
    ]
    if site:
        right.append(Paragraph(f"Site: {site.get('name')}", small))
    hdr = Table([[left, right]], colWidths=[10 * cm, 8 * cm])
    hdr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(hdr)
    story.append(Spacer(1, 16))

    bill_to = [
        Paragraph("Bill to", label),
        Spacer(1, 2),
        Paragraph((client.get("name") or "—").upper(), co_name),
    ]
    if client.get("contact_name"):
        bill_to.append(Paragraph(str(client["contact_name"]), body))
    c_addr = ", ".join(x for x in [client.get("address") or "", client.get("postcode") or ""] if (x or "").strip())
    if c_addr:
        bill_to.append(Paragraph(c_addr.replace("\n", "<br/>"), body))

    period_rows = [
        [Paragraph(f"From: {_fmt_date(date_from)}", body), ""],
        [Paragraph(f"To: {_fmt_date(date_to)}", body), ""],
        ["", ""],
        [Paragraph("Opening balance", body), Paragraph(_money(summary.get("opening_balance") or 0), body)],
        [Paragraph("Invoiced", body), Paragraph(_money(summary.get("invoiced") or 0), body)],
        [Paragraph("Credit balance", body), Paragraph(_money(summary.get("credit_balance") or 0), body)],
        [Paragraph("Paid", body), Paragraph(_money(summary.get("paid") or 0), body)],
        [Paragraph("Refunded", body), Paragraph(_money(summary.get("refunded") or 0), body)],
        [
            Paragraph(f"<b>Closing Balance on {_fmt_date(date_to)} (GBP)</b>", body),
            Paragraph(f"<b>{_money(summary.get('closing_balance') or 0)}</b>", body),
        ],
    ]
    t_sum = Table(period_rows, colWidths=[5.5 * cm, 2.5 * cm])
    t_sum.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, -1), (-1, -1), panel),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, -1), (-1, -1), 4),
        ("RIGHTPADDING", (0, -1), (-1, -1), 4),
    ]))
    top = Table([[bill_to, t_sum]], colWidths=[9.5 * cm, 8.5 * cm])
    top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(top)
    story.append(Spacer(1, 18))

    story.append(Paragraph("<b>Account activity</b>", styles["Heading3"]))
    story.append(Spacer(1, 6))

    rows = [["Date", "Item", "Amount", "Balance"]]
    for ln in data.get("lines") or []:
        kind = ln.get("kind")
        item = ln.get("item") or ""
        extras = []
        if ln.get("due_date"):
            extras.append(f"Due {_fmt_date(ln['due_date'])}")
        if ln.get("period_start") and ln.get("period_end"):
            extras.append(f"{_fmt_date(ln['period_start'])} – {_fmt_date(ln['period_end'])}")
        item_html = item
        if extras:
            item_html += f"<br/><font color='#64748b' size='7'>{' · '.join(extras)}</font>"
        amt = float(ln.get("amount") or 0)
        if kind == "payment":
            amt_s = f"({_money(abs(amt))})"
        else:
            amt_s = _money(amt)
        rows.append([
            _fmt_date(ln.get("date")),
            Paragraph(item_html, body),
            amt_s,
            _money(float(ln.get("balance") or 0)),
        ])

    t = Table(rows, colWidths=[3.2 * cm, 8.2 * cm, 3.2 * cm, 3.2 * cm], repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), panel),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
    ]
    for i, ln in enumerate(data.get("lines") or [], start=1):
        kind = ln.get("kind")
        if kind in ("opening", "closing"):
            cmds.append(("BACKGROUND", (0, i), (-1, i), soft if kind == "closing" else panel))
            cmds.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
    t.setStyle(TableStyle(cmds))
    story.append(t)
    story.append(Spacer(1, 16))

    closing = Table(
        [[
            Paragraph(f"<b>Closing balance on {_fmt_date(date_to)} (GBP)</b>", body),
            Paragraph(f"<b>{_money(summary.get('closing_balance') or 0)}</b>", ParagraphStyle("CloseAmt", parent=body, alignment=2, fontName="Helvetica-Bold")),
        ]],
        colWidths=[12 * cm, 6 * cm],
    )
    closing.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), panel),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(closing)

    build_branded(doc, story)
    return buf.getvalue()
