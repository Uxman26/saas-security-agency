"""Accident Report Log as a PDF, laid out like the paper X-FORM-077.

Two outputs from one layout: a completed report, and a blank to print for sites without
a device. ``blank=True`` simply draws the same form with rules instead of values, so the
printed sheet can never drift from the on-screen one.
"""

from __future__ import annotations

from io import BytesIO
from typing import Optional

from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas

from app.models import AccidentReport, Company

PAGE = landscape(A4)
W, H = PAGE
M = 14 * mm
LINE = 0.6
RULE_GREY = 0.45


def _rule(c: pdfcanvas.Canvas, x: float, y: float, width: float) -> None:
    c.setStrokeGray(RULE_GREY)
    c.setLineWidth(LINE)
    c.line(x, y, x + width, y)


def _labelled(
    c: pdfcanvas.Canvas, x: float, y: float, label: str, value: str, width: float, size: int = 9
) -> float:
    """Label, then the value on a rule. Returns the x just past the field."""
    c.setFont("Helvetica", size)
    c.setFillGray(0)
    c.drawString(x, y, label)
    lw = c.stringWidth(label, "Helvetica", size) + 3
    _rule(c, x + lw, y - 1.6, width - lw)
    if value:
        c.setFont("Helvetica-Bold", size)
        c.drawString(x + lw + 2, y + 1.2, value[:90])
    return x + width + 5 * mm


def _wrapped(c: pdfcanvas.Canvas, x: float, y: float, text: str, width: float, size: int = 9,
             leading: float = 11, max_lines: int = 3) -> None:
    c.setFont("Helvetica", size)
    c.setFillGray(0)
    words = (text or "").split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if c.stringWidth(trial, "Helvetica", size) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
            if len(lines) == max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    for i, line in enumerate(lines[:max_lines]):
        c.drawString(x, y - i * leading, line)


def _yesno(value: Optional[bool], blank: bool) -> str:
    if blank:
        return ""
    return "YES" if value else "NO"


def render_accident_pdf(
    report: Optional[AccidentReport],
    company: Optional[Company] = None,
    *,
    blank: bool = False,
    site_name: str = "",
) -> bytes:
    buf = BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=PAGE)
    c.setTitle("Accident Report Log")

    def val(attr: str) -> str:
        if blank or report is None:
            return ""
        v = getattr(report, attr, None)
        if v is None:
            return ""
        return str(v)

    y = H - M

    # --- header ---------------------------------------------------------------------
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W / 2, y - 4, "ACCIDENT REPORT LOG")

    c.setFont("Helvetica", 7.5)
    c.setFillGray(0.35)
    right = W - M
    c.drawRightString(right, y + 2, "X-FORM-077")
    if company and (company.name or "").strip():
        c.drawRightString(right, y - 8, (company.name or "").strip()[:44])
    if not blank and report is not None and report.reference:
        c.setFillGray(0)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(M, y + 2, report.reference)
    c.setFillGray(0)

    y -= 20 * mm

    # --- identity row ---------------------------------------------------------------
    col = M
    col = _labelled(c, col, y, "DATE", val("report_date"), 58 * mm)
    col = _labelled(c, col, y, "NAME (Supervisor completing report)", val("supervisor_name"), 110 * mm)
    _labelled(c, col, y, "SIA NO", val("sia_number"), right - col)

    y -= 11 * mm
    col = M
    col = _labelled(c, col, y, "TYPE OF ACCIDENT", val("accident_type"), 88 * mm)
    col = _labelled(c, col, y, "ACCIDENT TIME", val("accident_time"), 52 * mm)
    _labelled(c, col, y, "ACCIDENT LOCATION", val("accident_location"), right - col)

    y -= 11 * mm
    _labelled(c, M, y, "SITE", site_name, right - M)

    # --- persons involved box -------------------------------------------------------
    y -= 8 * mm
    box_h = 30 * mm
    c.setStrokeGray(0.2)
    c.setLineWidth(0.8)
    c.rect(M, y - box_h, right - M, box_h)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(M + 4 * mm, y - 6 * mm,
                 "Names, tel no, description of all persons involved including person that informed you "
                 "(Race/build/ age/clothing/ injuries sustained and first aid given)")
    if blank or report is None:
        for i in range(4):
            _rule(c, M + 4 * mm, y - (11 + i * 5.5) * mm, right - M - 8 * mm)
    else:
        _wrapped(c, M + 4 * mm, y - 11 * mm, val("persons_involved"), right - M - 8 * mm,
                 size=8.5, leading=11, max_lines=4)
    y -= box_h + 8 * mm

    # --- emergency services ---------------------------------------------------------
    services = (
        ("Police informed", "police_informed", "police_time_informed", "police_time_attended", "police_time_left"),
        ("Fire Service", "fire_informed", "fire_time_informed", "fire_time_attended", "fire_time_left"),
        ("Ambulance", "ambulance_informed", "ambulance_time_informed", "ambulance_time_attended", "ambulance_time_left"),
    )
    comments_x = W - M - 70 * mm
    for label, flag, t_informed, t_attended, t_left in services:
        c.setFont("Helvetica", 9)
        c.drawString(M, y, label)
        flag_val = _yesno(getattr(report, flag, False) if report else False, blank)
        if flag_val:
            c.setFont("Helvetica-Bold", 9)
            c.drawString(M + 42 * mm, y, flag_val)
        else:
            # Blank form: the prompt to circle, not an answer — so grey and not bold.
            c.setFont("Helvetica", 9)
            c.setFillGray(0.45)
            c.drawString(M + 42 * mm, y, "yes/no")
            c.setFillGray(0)
        for i, (cap, attr) in enumerate(
            (("time", t_informed), ("time attended", t_attended), ("time left", t_left))
        ):
            x = M + (62 + i * 42) * mm
            c.setFont("Helvetica", 8.5)
            c.drawString(x, y, cap)
            cw = c.stringWidth(cap, "Helvetica", 8.5) + 2
            _rule(c, x + cw, y - 1.6, 22 * mm)
            v = val(attr)
            if v:
                c.setFont("Helvetica-Bold", 8.5)
                c.drawString(x + cw + 2, y + 1.2, v)
            c.setFont("Helvetica", 8.5)
            c.drawString(x + cw + 24 * mm, y, "hrs")
        y -= 8 * mm

    # --- comments -------------------------------------------------------------------
    c.setFont("Helvetica", 9)
    c.drawString(comments_x, y + 26 * mm, "Comments:")
    if blank or report is None:
        for i in range(3):
            _rule(c, comments_x, y + (21 - i * 6) * mm, right - comments_x)
    else:
        _wrapped(c, comments_x, y + 21 * mm, val("comments"), right - comments_x,
                 size=8, leading=9, max_lines=3)

    # --- signature ------------------------------------------------------------------
    y -= 6 * mm
    _labelled(c, M, y, "Supervisor Signature", "", 100 * mm)
    _labelled(c, M + 110 * mm, y, "Date", val("report_date"), 60 * mm)

    # --- footer ---------------------------------------------------------------------
    c.setFont("Helvetica-Oblique", 7)
    c.setFillGray(0.4)
    if blank or report is None:
        c.drawString(M, M - 4, "Blank form — complete and return to your supervisor.")
    else:
        who = report.created_by.full_name if report.created_by else ""
        c.drawString(M, M - 4, f"Produced by: {who}".strip())
        c.drawRightString(right, M - 4, f"Status: {(report.status or 'open').replace('_', ' ').title()}")

    c.showPage()
    c.save()
    return buf.getvalue()
