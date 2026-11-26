"""Validate and normalise drawn signature payloads (PNG base64 / data-URLs)."""

from __future__ import annotations

import base64
import re
from typing import Optional

from fastapi import HTTPException

# Soft cap keeps responses lean while still allowing a high-res pad capture.
_MAX_BYTES = 350_000
_DATA_URL_RE = re.compile(r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$", re.I | re.S)
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"


def normalize_signature_data(raw: Optional[str]) -> Optional[str]:
    """Return a compact ``data:image/png;base64,…`` string, or ``None`` if empty.

    Rejects oversized or non-image payloads so typed names cannot be smuggled in
    as ``signature_data``.
    """
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None

    mime = "png"
    b64 = text
    m = _DATA_URL_RE.match(text)
    if m:
        mime = m.group(1).lower()
        if mime == "jpg":
            mime = "jpeg"
        b64 = m.group(2).strip()
    else:
        # Bare base64 — assume PNG unless magic says otherwise after decode.
        b64 = re.sub(r"\s+", "", text)

    try:
        blob = base64.b64decode(b64, validate=False)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid signature image encoding") from exc

    if not blob:
        return None
    if len(blob) > _MAX_BYTES:
        raise HTTPException(status_code=422, detail="Signature image is too large")

    if blob.startswith(_PNG_MAGIC):
        mime = "png"
    elif blob.startswith(_JPEG_MAGIC):
        mime = "jpeg"
    elif mime not in ("png", "jpeg", "webp"):
        raise HTTPException(status_code=422, detail="Signature must be a PNG or JPEG image")

    encoded = base64.b64encode(blob).decode("ascii")
    return f"data:image/{mime};base64,{encoded}"
