from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Lead, LeadConversion, LeadFollowUp
from app.services.lead_service import require_leads_module


def lead_dashboard(
    db: Session,
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    company = require_leads_module(db, user_id)
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    total = db.query(Lead).filter(Lead.company_id == company.id).count()
    period_leads = (
        db.query(Lead)
        .filter(Lead.company_id == company.id, Lead.created_at >= start_dt, Lead.created_at <= end_dt)
        .all()
    )
    converted = sum(1 for l in period_leads if l.converted)
    conversion_rate = round((converted / len(period_leads) * 100) if period_leads else 0, 1)

    by_status: dict[str, int] = defaultdict(int)
    by_source: dict[str, int] = defaultdict(int)
    by_assignee: dict[str, dict] = defaultdict(lambda: {"count": 0, "won": 0, "value": 0.0})
    for l in period_leads:
        by_status[l.status] += 1
        src = l.source or "unknown"
        by_source[src] += 1
        key = str(l.assigned_user_id or "unassigned")
        by_assignee[key]["count"] += 1
        if l.status == "won" or l.converted:
            by_assignee[key]["won"] += 1
        by_assignee[key]["value"] += float(l.estimated_value or 0)

    funnel = [{"status": k, "count": v} for k, v in sorted(by_status.items(), key=lambda x: -x[1])]
    sources = [{"source": k, "count": v} for k, v in sorted(by_source.items(), key=lambda x: -x[1])]

    prev_start = start_date - (end_date - start_date) - timedelta(days=1)
    prev_end = start_date - timedelta(days=1)
    prev_count = (
        db.query(func.count(Lead.id))
        .filter(
            Lead.company_id == company.id,
            Lead.created_at >= datetime.combine(prev_start, datetime.min.time()),
            Lead.created_at <= datetime.combine(prev_end, datetime.max.time()),
        )
        .scalar()
        or 0
    )
    growth = round(((len(period_leads) - prev_count) / prev_count * 100) if prev_count else 0, 1)

    forecast = (
        db.query(func.sum(Lead.estimated_value))
        .filter(Lead.company_id == company.id, Lead.converted == False, Lead.status.notin_(["lost", "won"]))
        .scalar()
        or 0
    )

    missed = (
        db.query(LeadFollowUp)
        .filter(
            LeadFollowUp.company_id == company.id,
            LeadFollowUp.completed_at.is_(None),
            LeadFollowUp.due_at < datetime.utcnow(),
        )
        .count()
    )

    trend: list[dict] = []
    d = start_date
    while d <= end_date:
        nxt = d + timedelta(days=1)
        c = (
            db.query(func.count(Lead.id))
            .filter(
                Lead.company_id == company.id,
                Lead.created_at >= datetime.combine(d, datetime.min.time()),
                Lead.created_at < datetime.combine(nxt, datetime.min.time()),
            )
            .scalar()
            or 0
        )
        trend.append({"date": d.isoformat(), "count": c})
        d = nxt

    return {
        "total_leads": total,
        "period_leads": len(period_leads),
        "conversion_rate": conversion_rate,
        "monthly_growth": growth,
        "revenue_forecast": round(float(forecast), 2),
        "missed_follow_ups": missed,
        "funnel": funnel,
        "sources": sources,
        "assignee_performance": [
            {"assignee_id": k, **v} for k, v in by_assignee.items()
        ],
        "trend": trend,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
    }
