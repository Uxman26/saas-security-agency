from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Optional

BANNER_HEIGHT = 34
HEADLINE = "ControlOps – Free"
SUBLINE = "Sign up now at controlops.co.uk"
POWERED_BY = "Powered by ControlOps"
POWERED_BY_SUBLINE = "controlops.co.uk"
_NAVY = (0.09, 0.16, 0.29)
_MUTED = (0.39, 0.45, 0.55)
_RULE = (0.82, 0.86, 0.91)


@lru_cache(maxsize=1)
def controlops_icon_path() -> Optional[str]:
    here = Path(__file__).resolve()
    for p in (
        here.parents[2] / "static" / "controlops-icon.png",
        here.parents[3] / "frontend" / "public" / "ControlOps-Logos" / "controlOps-icon.png",
        here.parents[3] / "frontend" / "public" / "ControlOps-Logos" / "controlOps-icon-dark.png",
    ):
        if p.is_file():
            return str(p)
    return None


def branded_bottom_margin(base) -> float:
    return float(base) + BANNER_HEIGHT + 8


def draw_marketing_banner(c, pagesize=None) -> None:
    from reportlab.lib.pagesizes import A4

    w, _h = pagesize or A4
    c.saveState()
    y0 = 6
    left = 36
    right = w - 36
    c.setStrokeColorRGB(*_RULE)
    c.setLineWidth(0.55)
    c.line(left, y0 + BANNER_HEIGHT - 1, right, y0 + BANNER_HEIGHT - 1)

    icon = controlops_icon_path()
    icon_size = 20
    if icon:
        try:
            c.drawImage(
                icon,
                left,
                y0 + 7,
                width=icon_size,
                height=icon_size,
                mask="auto",
                preserveAspectRatio=True,
            )
        except Exception:
            pass

    c.setFillColorRGB(*_NAVY)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(w / 2, y0 + 17, HEADLINE)
    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(w / 2, y0 + 6, SUBLINE)
    c.restoreState()


def draw_powered_by_banner(c, pagesize=None) -> None:
    """The ControlOps logo and "Powered by" label at the foot of invoices and receipts."""
    from reportlab.lib.pagesizes import A4

    w, _h = pagesize or A4
    c.saveState()
    y0 = 6
    c.setStrokeColorRGB(*_RULE)
    c.setLineWidth(0.55)
    c.line(36, y0 + BANNER_HEIGHT - 1, w - 36, y0 + BANNER_HEIGHT - 1)

    icon = controlops_icon_path()
    icon_size = 20
    gap = 6
    text_w = c.stringWidth(POWERED_BY, "Helvetica-Bold", 9)
    group_w = text_w + (icon_size + gap if icon else 0)
    x = (w - group_w) / 2
    if icon:
        try:
            c.drawImage(icon, x, y0 + 7, width=icon_size, height=icon_size, mask="auto", preserveAspectRatio=True)
        except Exception:
            pass
        x += icon_size + gap
    c.setFillColorRGB(*_NAVY)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y0 + 18, POWERED_BY)
    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(x, y0 + 8, POWERED_BY_SUBLINE)
    c.restoreState()


def company_logo_flowable(company, width, height):
    """The tenant's own logo as a reportlab image, or None when there is none to draw."""
    from io import BytesIO

    from PIL import Image
    from reportlab.platypus import Image as RLImage

    from app.services.image_avif_service import AVIF_EXT
    from app.storage_paths import resolve_storage_path

    resolved = resolve_storage_path(company.logo_path)
    if not resolved:
        return None
    try:
        if Path(resolved).suffix.lower() == AVIF_EXT:
            png = BytesIO()
            Image.open(resolved).save(png, format="PNG")
            png.seek(0)
            return RLImage(png, width=width, height=height, kind="proportional")
        return RLImage(resolved, width=width, height=height, kind="proportional")
    except Exception:
        return None


def on_branded_page(canvas, doc) -> None:
    draw_marketing_banner(canvas, getattr(doc, "pagesize", None))


def build_branded(
    doc,
    story,
    onFirstPage: Optional[Callable[..., Any]] = None,
    onLaterPages: Optional[Callable[..., Any]] = None,
    powered_by: bool = False,
    **kwargs,
) -> None:
    banner = draw_powered_by_banner if powered_by else draw_marketing_banner

    def _wrap(cb: Optional[Callable[..., Any]]):
        def _fn(canvas, d):
            if cb is not None:
                cb(canvas, d)
            banner(canvas, getattr(d, "pagesize", None))

        return _fn

    first = _wrap(onFirstPage)
    later = _wrap(onLaterPages if onLaterPages is not None else onFirstPage)
    doc.build(story, onFirstPage=first, onLaterPages=later, **kwargs)
