from io import BytesIO
from typing import List

from app.schemas import RotaDetailResponse, RotaSummaryRow


def export_rota_xlsx(details: List[RotaDetailResponse], summary: List[RotaSummaryRow]) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = "Shifts"
    hdr = [
        "ID",
        "Date",
        "Guard",
        "Site",
        "Client",
        "Start",
        "End",
        "Break (min)",
        "Type",
        "Hours",
        "Status",
        "Late (min)",
    ]
    ws.append(hdr)
    for c in ws[1]:
        c.font = Font(bold=True)
    for d in details:
        ws.append(
            [
                d.id,
                str(d.date),
                d.guard_name,
                d.site_name,
                d.client_name or "",
                d.shift_start or "",
                d.shift_end or "",
                d.break_minutes,
                d.shift_type,
                d.hours,
                d.attendance_status,
                d.late_minutes or "",
            ]
        )
    ws2 = wb.create_sheet("Summary")
    ws2.append(["Guard", "Total hours", "Late arrivals", "Committed (period)", "Overtime"])
    for c in ws2[1]:
        c.font = Font(bold=True)
    for s in summary:
        ws2.append([s.guard_name, s.total_hours, s.late_arrivals, s.committed_hours, s.overtime_hours])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_rota_pdf(details: List[RotaDetailResponse], summary: List[RotaSummaryRow]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), rightMargin=1 * cm, leftMargin=1 * cm, topMargin=1 * cm, bottomMargin=1 * cm)
    styles = getSampleStyleSheet()
    story = []
    story.append(Paragraph("Rota — shifts", styles["Title"]))
    story.append(Spacer(1, 12))
    if details:
        data = [["Date", "Guard", "Site", "Client", "Shift", "Type", "Hrs", "Status"]]
        for d in details:
            sh = f"{d.shift_start or '-'}–{d.shift_end or '-'}"
            data.append(
                [
                    str(d.date),
                    d.guard_name,
                    d.site_name[:24],
                    (d.client_name or "")[:20],
                    sh,
                    d.shift_type,
                    f"{d.hours:.1f}",
                    d.attendance_status,
                ]
            )
        t = Table(data, repeatRows=1)
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(t)
    story.append(Spacer(1, 24))
    story.append(Paragraph("Summary by guard", styles["Title"]))
    story.append(Spacer(1, 12))
    if summary:
        sdata = [["Guard", "Total hrs", "Late", "Committed", "Overtime"]]
        for s in summary:
            sdata.append(
                [
                    s.guard_name[:30],
                    f"{s.total_hours:.1f}",
                    str(s.late_arrivals),
                    f"{s.committed_hours:.1f}",
                    f"{s.overtime_hours:.1f}",
                ]
            )
        t2 = Table(sdata, repeatRows=1)
        t2.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                ]
            )
        )
        story.append(t2)
    doc.build(story)
    return buf.getvalue()
