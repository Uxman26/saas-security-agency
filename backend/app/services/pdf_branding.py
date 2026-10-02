from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Optional

BANNER_HEIGHT = 34
HEADLINE = "ControlOps – Free"
SUBLINE = "Sign up now at controlops.co.uk"
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


def on_branded_page(canvas, doc) -> None:
    draw_marketing_banner(canvas, getattr(doc, "pagesize", None))


def build_branded(
    doc,
    story,
    onFirstPage: Optional[Callable[..., Any]] = None,
    onLaterPages: Optional[Callable[..., Any]] = None,
    **kwargs,
) -> None:
    def _wrap(cb: Optional[Callable[..., Any]]):
        def _fn(canvas, d):
            if cb is not None:
                cb(canvas, d)
            draw_marketing_banner(canvas, getattr(d, "pagesize", None))

        return _fn

    first = _wrap(onFirstPage)
    later = _wrap(onLaterPages if onLaterPages is not None else onFirstPage)
    doc.build(story, onFirstPage=first, onLaterPages=later, **kwargs)
