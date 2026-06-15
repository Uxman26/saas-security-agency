import csv
import io
from typing import Any

from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def to_csv(rows: list[dict[str, Any]], columns: list[tuple[str, str]]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c[1] for c in columns])
    for row in rows:
        w.writerow([row.get(c[0], "") for c in columns])
    return buf.getvalue().encode("utf-8-sig")


def to_xlsx(rows: list[dict[str, Any]], columns: list[tuple[str, str]], sheet_name: str = "Report") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name[:31]
    ws.append([c[1] for c in columns])
    for row in rows:
        ws.append([row.get(c[0], "") for c in columns])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_pdf_table(title: str, rows: list[dict[str, Any]], columns: list[tuple[str, str]]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    data = [[c[1] for c in columns]]
    for row in rows:
        data.append([str(row.get(c[0], "")) for c in columns])
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    story = [Paragraph(title, styles["Title"]), Spacer(1, 12), table]
    doc.build(story)
    return buf.getvalue()
