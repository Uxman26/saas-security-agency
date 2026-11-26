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


def address_block(street: Any, town: Any, county: Any, postcode: Any) -> str:
    """An address the way it is printed: street lines, then town, county and postcode,
    each on its own line. Blank parts are left out."""
    lines = [ln.strip() for ln in _s(street).splitlines() if ln.strip()]
    return "\n".join(lines + [p for p in (_s(town), _s(county), _s(postcode)) if p])


def _billing_address_of(row, street_attr: str) -> str:
    """The registered/billing address of a client or site, or "" when none is entered."""
    if row is None:
        return ""
    return address_block(
        getattr(row, street_attr, None),
        getattr(row, "billing_town_city", None),
        getattr(row, "billing_county", None),
        getattr(row, "billing_postcode", None),
    )


def _main_address_of(row) -> str:
    return address_block(
        getattr(row, "address", None),
        getattr(row, "town_city", None),
        getattr(row, "county", None),
        getattr(row, "postcode", None),
    )


def billing_party(client, site) -> dict[str, str]:
    """Name, address (multi-line), contact, email and phone for "Bill to"."""
    site_name = _s(getattr(site, "billing_name", None)) if site else ""
    site_addr = _billing_address_of(site, "invoice_address")
    client_name = _s(getattr(client, "billing_name", None)) if client else ""
    client_addr = _billing_address_of(client, "billing_address")

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
        address = _main_address_of(client)
    elif site is not None:
        address = _main_address_of(site)
    else:
        address = ""

    if client is not None:
        contact, email, phone = _s(client.contact_person), _s(client.email), _s(client.phone)
    elif site is not None:
        contact, email, phone = _s(site.contact_person), _s(site.contact_email), _s(site.contact_phone)
    else:
        contact = email = phone = ""
    return {"name": name or "—", "address": address, "contact": contact, "email": email, "phone": phone}
