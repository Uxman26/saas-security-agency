from __future__ import annotations

from io import BytesIO
from typing import Optional

from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas

from app.models import Company, OccurrenceSheet
from app.services.pdf_branding import BANNER_HEIGHT, draw_marketing_banner

PAGE = landscape(A4)
W, H = PAGE
M = 14 * mm
BLANK_ROWS = 12
FOOTER_BASE = M + BANNER_HEIGHT + 2

ACCENT = (0.957, 0.318, 0.0)  # #F45100
NAVY = (0.059, 0.090, 0.165)  # #0F172A
PANEL = (0.945, 0.961, 0.976)  # #F1F5F9
SOFT = (1.0, 0.957, 0.929)  # #FFF4ED
MUTED = (0.39, 0.45, 0.55)

COL_SERIAL = 16 * mm
COL_START = 24 * mm
COL_FINISH = 24 * mm
COL_ACTIONS = 58 * mm

_STATUS_LABELS = {
    "open": "Open",
    "reported": "Reported",
    "reviewed": "Reviewed",
    "closed": "Closed",
    "submitted": "Reported",
}


def _normalize_status_label(value: Optional[str]) -> str:
    key = (value or "open").strip().lower()
    return _STATUS_LABELS.get(key, key.replace("_", " ").title())


def _wrap(c: pdfcanvas.Canvas, text: str, width: float, size: float, font: str = "Helvetica") -> list[str]:
    words = (text or "").replace("\n", " ").split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if c.stringWidth(trial, font, size) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def _set_fill(c: pdfcanvas.Canvas, rgb: tuple[float, float, float]) -> None:
    c.setFillColorRGB(*rgb)


def _set_stroke(c: pdfcanvas.Canvas, rgb: tuple[float, float, float]) -> None:
    c.setStrokeColorRGB(*rgb)


def _draw_header(
    c: pdfcanvas.Canvas,
    *,
    company: Optional[Company],
    sheet: Optional[OccurrenceSheet],
    blank: bool,
    site_name: str,
    page_no: int,
    page_count: int,
) -> float:
    # Accent rule
    _set_fill(c, ACCENT)
    c.rect(0, H - 3.2 * mm, W, 3.2 * mm, fill=1, stroke=0)

    y = H - M - 2 * mm
    _set_fill(c, NAVY)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(M, y, "Daily Occurrences Sheet")

    c.setFont("Helvetica", 8)
    _set_fill(c, MUTED)
    if company and (company.name or "").strip():
        c.drawRightString(W - M, y + 1, (company.name or "").strip()[:48])
    y -= 5 * mm
    meta_bits = []
    if not blank and sheet is not None and sheet.reference:
        meta_bits.append(f"Ref: {sheet.reference}")
    if site_name:
        meta_bits.append(f"Site: {site_name}")
    if not blank and sheet is not None:
        meta_bits.append(f"Status: {_normalize_status_label(sheet.status)}")
    meta_bits.append(f"Page {page_no} of {page_count}")
    c.drawString(M, y, "  ·  ".join(meta_bits))

    if company:
        addr = " · ".join(
            x for x in [(company.address or "").strip().replace("\n", ", "), (company.postcode or "").strip()] if x
        )
        if addr:
            y -= 4 * mm
            c.drawString(M, y, addr[:110])

    y -= 5 * mm
    _set_stroke(c, ACCENT)
    c.setLineWidth(1.1)
    c.line(M, y, W - M, y)
    return y - 6 * mm


def _draw_footer(c: pdfcanvas.Canvas, *, blank: bool, sheet: Optional[OccurrenceSheet]) -> None:
    _set_stroke(c, (0.86, 0.89, 0.93))
    c.setLineWidth(0.5)
    c.line(M, FOOTER_BASE + 4 * mm, W - M, FOOTER_BASE + 4 * mm)
    c.setFont("Helvetica", 7)
    _set_fill(c, MUTED)
    if blank or sheet is None:
        c.drawString(M, FOOTER_BASE, "Blank form — complete during the shift and return to your supervisor.")
    else:
        who = sheet.created_by.full_name if getattr(sheet, "created_by", None) else ""
        left = f"Produced by ControlOps{' · ' + who if who else ''}"
        c.drawString(M, FOOTER_BASE, left[:90])
        c.drawRightString(W - M, FOOTER_BASE, "Confidential — for authorised client submission")


def _draw_summary_strip(c: pdfcanvas.Canvas, y: float, sheet: Optional[OccurrenceSheet], blank: bool) -> float:
    strip_h = 12 * mm
    cells = (
        ("Date", (sheet.sheet_date.strftime("%d %B %Y") if sheet and not blank else ""), 38 * mm),
        ("Day", (sheet.sheet_date.strftime("%A") if sheet and not blank else ""), 28 * mm),
        ("Security Officers", (sheet.officer_names if sheet and not blank else "") or "", 78 * mm),
        ("Shift start", (sheet.shift_start if sheet and not blank else "") or "", 28 * mm),
        ("Shift end", (sheet.shift_end if sheet and not blank else "") or "", 28 * mm),
    )
    x = M
    total_w = W - 2 * M
    # normalize widths to page
    raw = sum(w for _, _, w in cells)
    scale = total_w / raw
    for label, value, width in cells:
        w = width * scale
        _set_fill(c, PANEL)
        _set_stroke(c, (0.8, 0.84, 0.88))
        c.setLineWidth(0.6)
        c.rect(x, y - strip_h, w, strip_h, fill=1, stroke=1)
        _set_fill(c, MUTED)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(x + 2 * mm, y - 3.5 * mm, label.upper())
        _set_fill(c, NAVY)
        c.setFont("Helvetica-Bold" if value else "Helvetica", 8.5)
        shown = value if value else ("—" if not blank else "")
        if blank and not value:
            _set_fill(c, MUTED)
            c.setFont("Helvetica", 8)
            shown = ""
        c.drawString(x + 2 * mm, y - 8.5 * mm, str(shown)[: int(w / 2.2)])
        x += w
    return y - strip_h - 5 * mm


def _draw_table_header(c: pdfcanvas.Canvas, y: float, xs: list[float], widths: list[float]) -> float:
    header_h = 8 * mm
    headers = ["No.", "Start", "Finish", "Occurrences & patrols", "Actions taken"]
    _set_fill(c, NAVY)
    c.rect(M, y - header_h, W - 2 * M, header_h, fill=1, stroke=0)
    _set_fill(c, (1, 1, 1))
    c.setFont("Helvetica-Bold", 7.5)
    for i, head in enumerate(headers):
        c.drawCentredString(xs[i] + widths[i] / 2, y - header_h / 2 - 2, head)
    return y - header_h


def render_occurrence_pdf(
    sheet: Optional[OccurrenceSheet],
    company: Optional[Company] = None,
    *,
    blank: bool = False,
    site_name: str = "",
) -> bytes:
    buf = BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=PAGE)
    title_ref = sheet.reference if sheet and not blank else "Blank"
    c.setTitle(f"Daily Occurrences Sheet — {title_ref}")
    c.setAuthor((company.name if company else "ControlOps") or "ControlOps")

    entries = [] if blank or sheet is None else list(sheet.entries or [])
    if blank and not entries:
        entries = [None] * BLANK_ROWS  # type: ignore

    inner = W - 2 * M
    col_occ = inner - COL_SERIAL - COL_START - COL_FINISH - COL_ACTIONS
    widths = [COL_SERIAL, COL_START, COL_FINISH, col_occ, COL_ACTIONS]
    xs = [M]
    for w in widths[:-1]:
        xs.append(xs[-1] + w)

    row_h = 9.5 * mm
    bottom = FOOTER_BASE + 16 * mm
    # Estimate rows per page after header/summary
    usable_first = H - M - 52 * mm - bottom
    usable_next = H - M - 28 * mm - bottom
    rows_first = max(1, int(usable_first / row_h))
    rows_next = max(1, int(usable_next / row_h))

    chunks: list[list] = []
    remaining = list(entries) if entries else [None] * BLANK_ROWS
    if not remaining:
        remaining = [None] * BLANK_ROWS
    first = True
    while remaining:
        n = rows_first if first else rows_next
        chunks.append(remaining[:n])
        remaining = remaining[n:]
        first = False
    page_count = max(1, len(chunks))

    for page_idx, chunk in enumerate(chunks, start=1):
        y = _draw_header(
            c,
            company=company,
            sheet=sheet,
            blank=blank,
            site_name=site_name,
            page_no=page_idx,
            page_count=page_count,
        )
        if page_idx == 1:
            y = _draw_summary_strip(c, y, sheet, blank)

        y = _draw_table_header(c, y, xs, widths)
        _set_stroke(c, (0.8, 0.84, 0.88))
        c.setLineWidth(0.45)

        for i, entry in enumerate(chunk):
            ry = y - row_h
            if i % 2 == 1:
                _set_fill(c, SOFT)
                c.rect(M, ry, inner, row_h, fill=1, stroke=0)
            for j in range(5):
                c.rect(xs[j], ry, widths[j], row_h, fill=0, stroke=1)
            if entry is not None:
                _set_fill(c, NAVY)
                c.setFont("Helvetica", 7.5)
                c.drawCentredString(xs[0] + widths[0] / 2, ry + row_h / 2 - 2, str(getattr(entry, "serial_no", i + 1)))
                c.drawCentredString(xs[1] + widths[1] / 2, ry + row_h / 2 - 2, getattr(entry, "start_time", "") or "")
                c.drawCentredString(xs[2] + widths[2] / 2, ry + row_h / 2 - 2, getattr(entry, "finish_time", "") or "")
                for text, idx in ((getattr(entry, "occurrence", None), 3), (getattr(entry, "action_taken", None), 4)):
                    lines = _wrap(c, text or "", widths[idx] - 3 * mm, 7)[:2]
                    c.setFont("Helvetica", 7)
                    for li, line in enumerate(lines):
                        c.drawString(xs[idx] + 1.5 * mm, ry + row_h - 3.8 * mm - li * 3.2 * mm, line)
            y = ry

        # Signature block on last page
        if page_idx == page_count:
            y -= 10 * mm
            _set_fill(c, NAVY)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(M, y + 4 * mm, "Authorisation")
            _set_fill(c, MUTED)
            c.setFont("Helvetica", 8)
            c.drawString(M, y - 2 * mm, "Security guard signature")
            _set_stroke(c, MUTED)
            c.setLineWidth(0.7)
            c.line(M + 42 * mm, y - 3 * mm, M + 110 * mm, y - 3 * mm)
            c.drawString(M + 118 * mm, y - 2 * mm, "Printed name")
            c.line(M + 142 * mm, y - 3 * mm, W - M, y - 3 * mm)
            if not blank and sheet is not None and sheet.signature_name:
                _set_fill(c, NAVY)
                c.setFont("Helvetica-Bold", 9)
                c.drawString(M + 144 * mm, y, sheet.signature_name[:36])

        _draw_footer(c, blank=blank, sheet=sheet)
        draw_marketing_banner(c, PAGE)
        c.showPage()

    c.save()
    return buf.getvalue()
