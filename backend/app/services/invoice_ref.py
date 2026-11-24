"""How an invoice is named to people: by its own number (XSBH001), never its database id.

The id is only a fallback for an invoice that was never given a number.
"""
from __future__ import annotations

import re


def invoice_no(inv) -> str:
    """"XSBH001", or the id ("32") when the invoice has no number."""
    if inv is None:
        return ""
    return (getattr(inv, "invoice_number", None) or "").strip() or str(inv.id)


def invoice_label(inv) -> str:
    """"Invoice XSBH001", or "Invoice #32" when the invoice has no number."""
    num = (getattr(inv, "invoice_number", None) or "").strip()
    return f"Invoice {num}" if num else f"Invoice #{inv.id}"


def invoice_filename(inv, prefix: str = "Invoice") -> str:
    """"Invoice-XSBH001.pdf": safe for a download / attachment name."""
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", invoice_no(inv)).strip("-") or str(inv.id)
    return f"{prefix}-{safe}.pdf"
