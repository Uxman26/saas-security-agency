from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import Client, Invoice, Site
from app.services.company_service import get_company_by_user_id
from app.services.credit_note_service import ACTIVE_STATUSES


def _as_date(v) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _invoice_date(inv: Invoice) -> date:
    return _as_date(inv.invoice_date) or _as_date(inv.created_at) or inv.period_start


def _invoice_matches_site(inv: Invoice, site_id: Optional[int]) -> bool:
    if not site_id:
        return True
    return any(line.site_id == site_id for line in (inv.lines or []))


def _invoice_amount_for_site(inv: Invoice, site_id: Optional[int]) -> float:
    total = float(inv.total or 0)
    if not site_id:
        return total
    lines = [ln for ln in (inv.lines or []) if ln.site_id == site_id]
    if not lines:
        return 0.0
    line_sum = sum(float(ln.amount or 0) + float(ln.allowance_amount or 0) for ln in lines)
    all_sum = sum(float(ln.amount or 0) + float(ln.allowance_amount or 0) for ln in (inv.lines or []))
    if all_sum <= 0:
        return total if any(ln.site_id == site_id for ln in (inv.lines or [])) else 0.0
    return round(total * (line_sum / all_sum), 2)


def _share_for_site(inv: Invoice, amount: float, site_id: Optional[int]) -> float:
    if not site_id:
        return float(amount or 0)
    inv_amt = float(inv.total or 0)
    site_amt = _invoice_amount_for_site(inv, site_id)
    if inv_amt <= 0:
        return 0.0
    return round(float(amount or 0) * (site_amt / inv_amt), 2)


def build_statement(
    db: Session,
    user_id: int,
    *,
    client_id: Optional[int],
    site_id: Optional[int],
    date_from: date,
    date_to: date,
    statement_type: str = "all",
) -> dict[str, Any]:
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be after To date")
    if not client_id and not site_id:
        raise HTTPException(status_code=400, detail="Select a client or a site")
    kind = (statement_type or "all").strip().lower()
    if kind not in ("all", "outstanding"):
        raise HTTPException(status_code=400, detail="Type must be All or Outstanding")
    company = get_company_by_user_id(db, user_id)
    site = None
    if site_id:
        site = db.query(Site).filter(Site.id == site_id, Site.company_id == company.id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        if not client_id and site.client_id:
            client_id = site.client_id
    client = None
    if client_id:
        client = db.query(Client).filter(Client.id == client_id, Client.company_id == company.id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        if site and site.client_id and site.client_id != client_id:
            raise HTTPException(status_code=400, detail="Site does not belong to the selected client")

    q = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.lines),
            joinedload(Invoice.payments),
            joinedload(Invoice.credit_notes),
            joinedload(Invoice.client),
        )
        .filter(Invoice.company_id == company.id, Invoice.status != "cancelled")
    )
    if client_id:
        q = q.filter(Invoice.client_id == client_id)
    invoices = [inv for inv in q.all() if _invoice_matches_site(inv, site_id)]

    if kind == "outstanding":
        return _build_outstanding(
            company=company,
            client=client,
            site=site,
            invoices=invoices,
            site_id=site_id,
            date_from=date_from,
            date_to=date_to,
        )

    opening = 0.0
    invoiced = 0.0
    paid = 0.0
    credited = 0.0
    activities: list[dict[str, Any]] = []

    for inv in invoices:
        inv_date = _invoice_date(inv)
        amt = _invoice_amount_for_site(inv, site_id)
        if amt <= 0 and site_id:
            continue

        site_paid_before = 0.0
        site_credit_before = 0.0

        for p in inv.payments or []:
            if getattr(p, "deleted_at", None):
                continue
            p_date = _as_date(p.paid_at) or _as_date(p.created_at)
            p_amt = _share_for_site(inv, float(p.amount or 0), site_id)
            if not p_date or p_amt == 0:
                continue
            if p_date < date_from:
                site_paid_before += p_amt
            elif date_from <= p_date <= date_to:
                paid += p_amt
                activities.append(
                    {
                        "date": p_date.isoformat(),
                        "kind": "payment",
                        "item": f"Payment made for Invoice #{inv.id}",
                        "invoice_id": inv.id,
                        "amount": -round(p_amt, 2),
                        "method": p.method,
                    }
                )

        for cn in inv.credit_notes or []:
            if getattr(cn, "deleted_at", None):
                continue
            if cn.status not in ACTIVE_STATUSES:
                continue
            if site_id and cn.site_id and cn.site_id != site_id:
                continue
            c_date = _as_date(cn.credit_date) or _as_date(cn.created_at)
            if cn.site_id:
                c_amt = float(cn.total or 0)
            else:
                c_amt = _share_for_site(inv, float(cn.total or 0), site_id)
            if not c_date or c_amt == 0:
                continue
            if c_date < date_from:
                site_credit_before += c_amt
            elif date_from <= c_date <= date_to:
                credited += c_amt
                activities.append(
                    {
                        "date": c_date.isoformat(),
                        "kind": "credit",
                        "item": f"Credit note {cn.number} for Invoice #{inv.id}",
                        "invoice_id": inv.id,
                        "amount": -round(c_amt, 2),
                        "method": cn.reason,
                    }
                )

        if inv_date < date_from:
            if inv.status != "draft":
                opening += amt - site_paid_before - site_credit_before
        elif date_from <= inv_date <= date_to and inv.status != "draft":
            invoiced += amt
            due = inv.due_date.isoformat() if inv.due_date else None
            activities.append(
                {
                    "date": inv_date.isoformat(),
                    "kind": "invoice",
                    "item": f"Invoice #{inv.id}",
                    "invoice_id": inv.id,
                    "due_date": due,
                    "period_start": inv.period_start.isoformat() if inv.period_start else None,
                    "period_end": inv.period_end.isoformat() if inv.period_end else None,
                    "amount": round(amt, 2),
                    "status": inv.status,
                }
            )

    opening = round(opening, 2)
    invoiced = round(invoiced, 2)
    paid = round(paid, 2)
    credited = round(credited, 2)
    closing = round(opening + invoiced - paid - credited, 2)

    kind_order = {"payment": 0, "credit": 1, "invoice": 2}
    activities.sort(key=lambda a: (a["date"], kind_order.get(a["kind"], 9), a.get("invoice_id") or 0))

    balance = opening
    lines: list[dict[str, Any]] = [
        {
            "date": date_from.isoformat(),
            "kind": "opening",
            "item": "Opening Balance",
            "amount": opening,
            "balance": opening,
        }
    ]
    for act in activities:
        balance = round(balance + float(act["amount"]), 2)
        lines.append({**act, "balance": balance})
    lines.append(
        {
            "date": date_to.isoformat(),
            "kind": "closing",
            "item": "Closing Balance",
            "amount": closing,
            "balance": closing,
        }
    )

    return _statement_payload(
        company=company,
        client=client,
        site=site,
        date_from=date_from,
        date_to=date_to,
        opening=opening,
        invoiced=invoiced,
        credited=credited,
        paid=paid,
        closing=closing,
        lines=lines,
        statement_type="all",
    )


def _invoice_outstanding_as_of(inv: Invoice, site_id: Optional[int], as_of: date) -> float:
    amt = _invoice_amount_for_site(inv, site_id)
    if amt <= 0:
        return 0.0
    paid = 0.0
    credited = 0.0
    for p in inv.payments or []:
        if getattr(p, "deleted_at", None):
            continue
        p_date = _as_date(p.paid_at) or _as_date(p.created_at)
        if not p_date or p_date > as_of:
            continue
        paid += _share_for_site(inv, float(p.amount or 0), site_id)
    for cn in inv.credit_notes or []:
        if getattr(cn, "deleted_at", None):
            continue
        if cn.status not in ACTIVE_STATUSES:
            continue
        if site_id and cn.site_id and cn.site_id != site_id:
            continue
        c_date = _as_date(cn.credit_date) or _as_date(cn.created_at)
        if not c_date or c_date > as_of:
            continue
        if cn.site_id:
            credited += float(cn.total or 0)
        else:
            credited += _share_for_site(inv, float(cn.total or 0), site_id)
    return round(max(0.0, amt - paid - credited), 2)


def _build_outstanding(*, company, client, site, invoices, site_id, date_from, date_to) -> dict[str, Any]:
    rows = []
    for inv in invoices:
        if inv.status == "draft":
            continue
        inv_date = _invoice_date(inv)
        if inv_date > date_to:
            continue
        if inv_date < date_from:
            # Pre-period invoices still outstanding as of date_to are included
            pass
        bal = _invoice_outstanding_as_of(inv, site_id, date_to)
        if bal <= 0:
            continue
        if inv_date < date_from:
            # only show if still outstanding; treat as opening-period debt
            item_date = date_from
        else:
            item_date = inv_date
        due = inv.due_date.isoformat() if inv.due_date else None
        rows.append(
            {
                "date": item_date.isoformat(),
                "kind": "invoice",
                "item": f"Invoice #{inv.id} (outstanding)",
                "invoice_id": inv.id,
                "due_date": due,
                "period_start": inv.period_start.isoformat() if inv.period_start else None,
                "period_end": inv.period_end.isoformat() if inv.period_end else None,
                "amount": bal,
                "status": inv.status,
                "balance": 0.0,
            }
        )
    rows.sort(key=lambda a: (a["date"], a.get("invoice_id") or 0))
    total = round(sum(float(r["amount"]) for r in rows), 2)
    balance = 0.0
    lines: list[dict[str, Any]] = [
        {
            "date": date_from.isoformat(),
            "kind": "opening",
            "item": "Outstanding opening",
            "amount": 0.0,
            "balance": 0.0,
        }
    ]
    for r in rows:
        balance = round(balance + float(r["amount"]), 2)
        lines.append({**r, "balance": balance})
    lines.append(
        {
            "date": date_to.isoformat(),
            "kind": "closing",
            "item": "Total outstanding",
            "amount": total,
            "balance": total,
        }
    )
    return _statement_payload(
        company=company,
        client=client,
        site=site,
        date_from=date_from,
        date_to=date_to,
        opening=0.0,
        invoiced=total,
        credited=0.0,
        paid=0.0,
        closing=total,
        lines=lines,
        statement_type="outstanding",
    )


def _statement_payload(
    *,
    company,
    client,
    site,
    date_from,
    date_to,
    opening,
    invoiced,
    credited,
    paid,
    closing,
    lines,
    statement_type,
) -> dict[str, Any]:
    return {
        "company": {
            "id": company.id,
            "name": company.name,
            "email": company.email,
            "phone": company.phone,
            "address": company.address,
            "postcode": company.postcode,
        },
        "client": {
            "id": client.id if client else None,
            "name": client.name if client else (site.name if site else "—"),
            "contact_name": client.contact_person if client else None,
            "address": client.address if client else None,
            "postcode": client.postcode if client else None,
            "email": client.email if client else None,
        },
        "site": {"id": site.id, "name": site.name} if site else None,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "currency": "GBP",
        "statement_type": statement_type,
        "summary": {
            "opening_balance": opening,
            "invoiced": invoiced,
            "credit_balance": credited,
            "paid": paid,
            "refunded": 0.0,
            "closing_balance": closing,
            "total_outstanding": closing,
        },
        "lines": lines,
    }
