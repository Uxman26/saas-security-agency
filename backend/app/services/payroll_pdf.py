"""PDF renderings of the Payroll screen.

Both documents are built from the same service calls the screen itself uses, with the
same filters, so the file always shows exactly the rows that were on screen when it was
asked for.
"""

from __future__ import annotations

from datetime import date
from io import BytesIO
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Company, Guard
from app.services import payroll_service

PAYMENT_MODE_LABELS = {
    "100_bank": "100% Bank",
    "100_cash": "100% Cash",
    "split": "Bank + Cash Split",
}

ATT_LABELS = {
    "on_time": "On time",
    "late": "Late",
    "absent": "Absent",
    "pending": "Not marked",
    "scheduled": "Upcoming",
}


def _money(v: float) -> str:
    return f"£{float(v or 0):,.2f}"


def _doc(buf: BytesIO, title: str, landscape_page: bool = True):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate

    return SimpleDocTemplate(
        buf,
        pagesize=landscape(A4) if landscape_page else A4,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
        title=title,
    )


def _styles():
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("PayTitle", parent=base["Heading1"], fontSize=16, spaceAfter=2),
        "sub": ParagraphStyle("PaySub", parent=base["Normal"], fontSize=9, textColor="#64748B", spaceAfter=10),
        "h2": ParagraphStyle("PayH2", parent=base["Heading2"], fontSize=11, spaceBefore=10, spaceAfter=4),
        "cell": ParagraphStyle("PayCell", parent=base["Normal"], fontSize=8, leading=10),
    }


def _table(data, col_widths=None, align_right: tuple[int, ...] = ()):
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    for c in align_right:
        style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def _header(story, styles, company: Optional[Company], title: str, subtitle: str):
    from reportlab.platypus import Paragraph

    name = (company.name if company else "") or ""
    story.append(Paragraph(title, styles["title"]))
    story.append(Paragraph(" · ".join([x for x in (name, subtitle) if x]), styles["sub"]))


def render_payroll_records_pdf(
    db: Session,
    user_id: int,
    company: Optional[Company],
    *,
    guard_id: Optional[int] = None,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
    search: Optional[str] = None,
) -> bytes:
    """The Payroll Records table, filtered exactly as the screen filtered it."""
    from reportlab.platypus import Paragraph, Spacer

    rows = payroll_service.get_payrolls(db, user_id, guard_id, period_start, period_end, search)
    names = {
        g.id: g.full_name
        for g in db.query(Guard).filter(Guard.id.in_([r.guard_id for r in rows] or [0])).all()
    }

    buf = BytesIO()
    doc = _doc(buf, "Payroll records")
    styles = _styles()
    story: list = []

    filters = []
    if search:
        filters.append(f'search "{search}"')
    if period_start and period_end:
        filters.append(f"{period_start} to {period_end}")
    elif period_start:
        filters.append(f"from {period_start}")
    elif period_end:
        filters.append(f"up to {period_end}")
    subtitle = f"{len(rows)} record{'' if len(rows) == 1 else 's'}"
    if filters:
        subtitle += " · " + " · ".join(filters)
    _header(story, styles, company, "Payroll records", subtitle)

    head = ["Guard", "Period", "Hours", "Rate", "Bank", "Cash", "Allowances", "Payable", "Payment mode"]
    body = [head]
    tot_bank = tot_cash = tot_allow = 0.0
    for r in rows:
        bank = float(r.bank_amount or 0)
        cash = float(r.cash_amount or 0)
        allow = float(r.allowance_total or 0)
        tot_bank += bank
        tot_cash += cash
        tot_allow += allow
        body.append(
            [
                names.get(r.guard_id, f"Guard #{r.guard_id}"),
                f"{r.period_start} – {r.period_end}",
                f"{float(r.total_hours or 0):.2f}",
                _money(r.hourly_rate),
                _money(bank),
                _money(cash),
                _money(allow),
                _money(bank + cash),
                PAYMENT_MODE_LABELS.get(r.payment_mode or "", r.payment_mode or ""),
            ]
        )

    if rows:
        body.append(
            [
                "Total",
                "",
                "",
                "",
                _money(tot_bank),
                _money(tot_cash),
                _money(tot_allow),
                _money(tot_bank + tot_cash),
                "",
            ]
        )
        story.append(_table(body, align_right=(2, 3, 4, 5, 6, 7)))
    else:
        story.append(Paragraph("No payroll records matched this search.", styles["cell"]))

    story.append(Spacer(1, 8))
    doc.build(story)
    return buf.getvalue()


def render_payroll_preview_pdf(
    db: Session,
    user_id: int,
    company: Optional[Company],
    *,
    period_start: date,
    period_end: date,
    guard_id: Optional[int] = None,
) -> bytes:
    """Employee hours & pay.

    With a guard_id this is the Breakdown view — one person, every shift — and the file
    carries only that person's rows, matching what the screen shows.
    """
    from reportlab.platypus import Paragraph, Spacer

    pv = payroll_service.preview_pay(db, user_id, guard_id, period_start, period_end)

    buf = BytesIO()
    doc = _doc(buf, "Employee hours & pay")
    styles = _styles()
    story: list = []

    scope = pv.guard_name if guard_id is not None else "All employees"
    _header(
        story,
        styles,
        company,
        "Employee hours & pay" if guard_id is None else f"Breakdown — {scope}",
        f"{pv.period_start} to {pv.period_end}",
    )

    summary = [
        ["Rota'd hours", "Attended hours", "Not attended", "Total pay"],
        [
            f"{pv.rota_hours:.2f}",
            f"{pv.attended_hours:.2f}",
            f"{pv.unattended_hours:.2f}",
            _money(pv.amount),
        ],
    ]
    story.append(_table(summary, align_right=(0, 1, 2, 3)))

    if guard_id is None and pv.by_employee:
        story.append(Paragraph("By employee", styles["h2"]))
        body = [["Employee", "Shifts", "Rota'd hrs", "Attended hrs", "Pay"]]
        for e in pv.by_employee:
            body.append(
                [e.guard_name, str(e.shifts), f"{e.rota_hours:.2f}", f"{e.attended_hours:.2f}", _money(e.amount)]
            )
        story.append(_table(body, align_right=(1, 2, 3, 4)))

    if pv.by_site:
        story.append(Paragraph("By site", styles["h2"]))
        body = [["Site", "Shifts", "Rota'd hrs", "Attended hrs", "Pay"]]
        for r in pv.by_site:
            body.append(
                [r.site_name or "—", str(r.shifts), f"{r.rota_hours:.2f}", f"{r.attended_hours:.2f}", _money(r.amount)]
            )
        story.append(_table(body, align_right=(1, 2, 3, 4)))

    if pv.shifts:
        story.append(Paragraph("Every shift", styles["h2"]))
        head = ["Date", "Employee", "Site", "Shift", "Break", "Hours", "Attendance", "Rate", "Pay"]
        if guard_id is not None:
            head.remove("Employee")
        body = [head]
        for s in pv.shifts:
            row = [
                str(s.date),
                s.guard_name,
                s.site_name or "—",
                f"{s.shift_start or ''}–{s.shift_end or ''}",
                f"-{s.break_minutes}m" if s.break_minutes else "—",
                f"{s.hours:.2f}",
                ATT_LABELS.get(s.attendance_status, s.attendance_status),
                _money(s.shift_rate) if s.shift_rate else "—",
                _money(s.amount),
            ]
            if guard_id is not None:
                row.pop(1)
            body.append(row)
        story.append(_table(body, align_right=(len(head) - 4, len(head) - 3, len(head) - 1)))

    story.append(Spacer(1, 8))
    doc.build(story)
    return buf.getvalue()
