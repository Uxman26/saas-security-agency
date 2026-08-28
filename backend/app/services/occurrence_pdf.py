"""Daily Occurrences Sheet as a PDF, laid out like the paper original.

As with the accident log, one layout produces both the completed sheet and the blank
printable version, so the printed form can never drift from the on-screen one.
"""

from __future__ import annotations

from io import BytesIO
from typing import Optional

from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas

from app.models import Company, OccurrenceSheet

PAGE = landscape(A4)
W, H = PAGE
M = 12 * mm
BLANK_ROWS = 14

# Column widths, proportional to the paper sheet: the occurrences column carries the
# writing so it takes everything the other four do not.
COL_SERIAL = 16 * mm
COL_START = 22 * mm
COL_FINISH = 22 * mm
COL_ACTIONS = 62 * mm


def _wrap(c: pdfcanvas.Canvas, text: str, width: float, size: float) -> list[str]:
    words = (text or "").split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if c.stringWidth(trial, "Helvetica", size) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def render_occurrence_pdf(
    sheet: Optional[OccurrenceSheet],
    company: Optional[Company] = None,
    *,
    blank: bool = False,
    site_name: str = "",
) -> bytes:
    buf = BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=PAGE)
    c.setTitle("Daily Occurrences Sheet")
    right = W - M
    inner = right - M

    y = H - M - 4 * mm

    # --- title bar -------------------------------------------------------------------
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W / 2, y, "DAILY OCCURRENCES SHEET")
    c.setFont("Helvetica", 7.5)
    c.setFillGray(0.35)
    if company and (company.name or "").strip():
        c.drawRightString(right, y + 1, (company.name or "").strip()[:44])
    if not blank and sheet is not None and sheet.reference:
        c.setFillGray(0)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(M, y + 1, sheet.reference)
    c.setFillGray(0)

    # --- date box --------------------------------------------------------------------
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(M, y + 2, "Date")
    c.setStrokeGray(0.2)
    c.setLineWidth(0.8)
    c.rect(M + 14 * mm, y - 3 * mm, 44 * mm, 9 * mm)
    if not blank and sheet is not None:
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(M + 36 * mm, y + 0.5, sheet.sheet_date.strftime("%d / %m / %Y"))
    else:
        c.setFont("Helvetica", 10)
        c.setFillGray(0.5)
        c.drawCentredString(M + 36 * mm, y + 0.5, "/            /")
        c.setFillGray(0)

    # --- header strip ----------------------------------------------------------------
    y -= 12 * mm
    strip_h = 11 * mm
    cells = (
        ("Day", (sheet.sheet_date.strftime("%A") if sheet and not blank else ""), 22 * mm, 34 * mm),
        ("Security Officer Names", (sheet.officer_names if sheet and not blank else "") or "", 44 * mm, 62 * mm),
        ("Start Shift Time", (sheet.shift_start if sheet and not blank else "") or "", 30 * mm, 24 * mm),
        ("End Shift Time", (sheet.shift_end if sheet and not blank else "") or "", 28 * mm, 24 * mm),
    )
    x = M
    for label, value, label_w, value_w in cells:
        c.setFillGray(0.9)
        c.rect(x, y - strip_h, label_w, strip_h, fill=1, stroke=1)
        c.setFillGray(0)
        c.setFont("Helvetica-Bold", 7.5)
        for i, part in enumerate(_wrap(c, label, label_w - 3 * mm, 7.5)):
            c.drawCentredString(x + label_w / 2, y - strip_h / 2 - 1 + (4 if i == 0 and len(part) < 40 else 0) - i * 8, part)
        c.rect(x + label_w, y - strip_h, value_w, strip_h)
        if value:
            c.setFont("Helvetica", 8)
            c.drawString(x + label_w + 2 * mm, y - strip_h / 2 - 2, str(value)[:34])
        x += label_w + value_w
    # Site is not on the paper form but every sheet belongs to one, so it earns a slot.
    if site_name:
        c.setFont("Helvetica", 8)
        c.setFillGray(0.35)
        c.drawString(M, y - strip_h - 5 * mm, f"Site: {site_name}")
        c.setFillGray(0)

    # --- table -----------------------------------------------------------------------
    y -= strip_h + (10 * mm if site_name else 6 * mm)
    col_occ = inner - COL_SERIAL - COL_START - COL_FINISH - COL_ACTIONS
    header_h = 9 * mm
    xs = [M, M + COL_SERIAL, M + COL_SERIAL + COL_START, M + COL_SERIAL + COL_START + COL_FINISH]
    xs.append(xs[3] + col_occ)
    widths = [COL_SERIAL, COL_START, COL_FINISH, col_occ, COL_ACTIONS]
    headers = ["Serial No", "Start Time", "Finish Time", "OCCURRENCES & PATROLS", "ACTIONS TAKEN"]

    c.setFillGray(0.9)
    c.rect(M, y - header_h, inner, header_h, fill=1, stroke=1)
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 7.5)
    for i, head in enumerate(headers):
        c.rect(xs[i], y - header_h, widths[i], header_h)
        parts = _wrap(c, head, widths[i] - 3 * mm, 7.5)
        for j, part in enumerate(parts):
            c.drawCentredString(xs[i] + widths[i] / 2, y - header_h / 2 - 2 + (len(parts) - 1 - j) * 7 - 1, part)
    y -= header_h

    entries = [] if blank or sheet is None else list(sheet.entries or [])
    bottom = M + 16 * mm
    row_h = 9 * mm
    rows = max(len(entries), BLANK_ROWS if (blank or not entries) else 0)
    rows = min(rows, int((y - bottom) / row_h))

    for i in range(rows):
        entry = entries[i] if i < len(entries) else None
        ry = y - row_h
        for j in range(5):
            c.rect(xs[j], ry, widths[j], row_h)
        if entry is not None:
            c.setFont("Helvetica", 7.5)
            c.drawCentredString(xs[0] + widths[0] / 2, ry + row_h / 2 - 2, str(entry.serial_no))
            c.drawCentredString(xs[1] + widths[1] / 2, ry + row_h / 2 - 2, entry.start_time or "")
            c.drawCentredString(xs[2] + widths[2] / 2, ry + row_h / 2 - 2, entry.finish_time or "")
            for k, (text, idx) in enumerate(((entry.occurrence, 3), (entry.action_taken, 4))):
                lines = _wrap(c, text or "", widths[idx] - 3 * mm, 7)[:2]
                c.setFont("Helvetica", 7)
                for li, line in enumerate(lines):
                    c.drawString(xs[idx] + 1.5 * mm, ry + row_h - 3.5 * mm - li * 3.2 * mm, line)
        y = ry

    # --- signature -------------------------------------------------------------------
    y -= 10 * mm
    c.setFont("Helvetica", 9)
    c.drawString(M + 10 * mm, y, "Security Guard Signature")
    c.setStrokeGray(0.45)
    c.setLineWidth(0.6)
    c.line(M + 52 * mm, y - 1.5, M + 122 * mm, y - 1.5)
    c.drawString(M + 132 * mm, y, "Security Name")
    c.line(M + 158 * mm, y - 1.5, right - 4 * mm, y - 1.5)
    if not blank and sheet is not None and sheet.signature_name:
        c.setFont("Helvetica-Bold", 9)
        c.drawString(M + 160 * mm, y + 1.5, sheet.signature_name[:34])

    c.setFont("Helvetica-Oblique", 7)
    c.setFillGray(0.4)
    if blank or sheet is None:
        c.drawString(M, M - 2, "Blank form — complete during the shift and return to your supervisor.")
    else:
        who = sheet.created_by.full_name if sheet.created_by else ""
        c.drawString(M, M - 2, f"Produced by: {who}".strip())
        c.drawRightString(right, M - 2, f"Status: {(sheet.status or 'open').title()}")

    c.showPage()
    c.save()
    return buf.getvalue()
