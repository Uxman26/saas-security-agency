"""Who an invoice (or statement) is addressed to.

Clients and sites each have two identities:
  * the trading name and site address (``name`` / ``address``), used by the rota; and
  * the registered company name and billing address (``billing_name`` /
    ``billing_address``, or ``invoice_address`` on a site), used on invoices.

The billed site's registered details win, then the client's, then the trading details.
"""
from __future__ import annotations

from typing import Any, Optional

# Written into rota-generated invoices by older versions as an internal reminder. It is
# never printed on an invoice the client sees.
LEGACY_ROTA_REVIEW_NOTE = "Generated from published rota. Please review shift timings and hours before sending."


def client_visible_rota_review(text: Optional[str]) -> str:
    t = (text or "").strip()
    return "" if t == LEGACY_ROTA_REVIEW_NOTE else t


def _s(v: Any) -> str:
    return str(v).strip() if v is not None else ""


def _joined(*parts: Any) -> str:
    return "\n".join(p for p in (_s(x) for x in parts) if p)


def billing_party(client, site) -> dict[str, str]:
    """Name, address (multi-line), contact, email and phone for "Bill to"."""
    site_name = _s(getattr(site, "billing_name", None)) if site else ""
    site_addr = _s(getattr(site, "invoice_address", None)) if site else ""
    client_name = _s(getattr(client, "billing_name", None)) if client else ""
    client_addr = _s(getattr(client, "billing_address", None)) if client else ""

    if site_name:
        name = site_name
    elif client_name:
        name = client_name
    elif client is not None:
        name = _s(client.name)
    else:
        name = _s(getattr(site, "name", None)) if site else ""

    if site_addr:
        address = site_addr
    elif client_addr:
        address = client_addr
    elif client is not None:
        address = _joined(client.address, getattr(client, "town_city", None), client.postcode)
    elif site is not None:
        address = _joined(site.address, getattr(site, "town_city", None), site.postcode)
    else:
        address = ""

    if client is not None:
        contact, email, phone = _s(client.contact_person), _s(client.email), _s(client.phone)
    elif site is not None:
        contact, email, phone = _s(site.contact_person), _s(site.contact_email), _s(site.contact_phone)
    else:
        contact = email = phone = ""
    return {"name": name or "—", "address": address, "contact": contact, "email": email, "phone": phone}
