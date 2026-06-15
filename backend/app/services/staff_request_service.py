import json
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import Client, RotaPlan, Site, StaffRequest, User
from app.rbac import user_has_permission_db, PERM_STAFF_REQ_REVIEW
from app.schemas import StaffRequestCreate, StaffRequestReview, StaffRequestResponse
from app.services.company_service import get_company_by_user_id

OPEN_EMP_ID = "__open__"
OPEN_EMP = {
    "id": OPEN_EMP_ID,
    "name": "Open shifts",
    "role": "Unassigned",
    "avatarColor": "#94a3b8",
}
SHIFT_COLOR = "#3b82f6"


def _day_keys(start: date, day_count: int) -> list[str]:
    return [(start + timedelta(days=i)).isoformat() for i in range(max(1, day_count))]


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _empty_planner(plan: RotaPlan) -> dict:
    days = _day_keys(plan.start_date, plan.day_count)
    return {
        "rotaView": plan.view_mode or "table",
        "days": days,
        "employees": [],
        "shifts": {},
        "attendance": {},
        "budget": float(plan.budget or 0),
        "inclBreaks": False,
    }


def _find_or_create_plan(db: Session, company_id: int, shift_date: date) -> RotaPlan:
    plan = (
        db.query(RotaPlan)
        .filter(
            RotaPlan.company_id == company_id,
            RotaPlan.status == "draft",
            RotaPlan.start_date <= shift_date,
            RotaPlan.end_date >= shift_date,
        )
        .order_by(RotaPlan.updated_at.desc())
        .first()
    )
    if plan:
        return plan
    start = _week_start(shift_date)
    day_count = 7
    end = start + timedelta(days=day_count - 1)
    days = _day_keys(start, day_count)
    plan = RotaPlan(
        company_id=company_id,
        name=f"Client requests {start.strftime('%d %b %Y')}",
        start_date=start,
        end_date=end,
        day_count=day_count,
        view_mode="table",
        budget=0,
        status="draft",
        planner_data=json.dumps(
            {
                "rotaView": "table",
                "days": days,
                "employees": [],
                "shifts": {},
                "attendance": {},
                "budget": 0,
                "inclBreaks": False,
            }
        ),
    )
    db.add(plan)
    db.flush()
    return plan


def _append_shift_to_plan(
    plan: RotaPlan,
    shift_date: date,
    site_name: str,
    shift_start: str,
    shift_end: str,
    break_minutes: int,
    notes: str,
    label: str,
) -> None:
    try:
        data = json.loads(plan.planner_data) if plan.planner_data else _empty_planner(plan)
    except json.JSONDecodeError:
        data = _empty_planner(plan)
    dk = shift_date.isoformat()
    if dk not in (data.get("days") or []):
        raise HTTPException(
            status_code=400,
            detail="Shift date is outside the target rota period. Extend the rota or pick another draft plan.",
        )
    employees = data.get("employees") or []
    if not any(e.get("id") == OPEN_EMP_ID for e in employees):
        employees.append(dict(OPEN_EMP))
    data["employees"] = employees
    shifts = data.get("shifts") or {}
    emp_shifts = shifts.get(OPEN_EMP_ID) or {}
    block = {
        "start": shift_start,
        "end": shift_end,
        "site": site_name,
        "notes": notes or "",
        "breakH": break_minutes // 60,
        "breakM": break_minutes % 60,
        "color": SHIFT_COLOR,
        "label": (label or "")[:20],
    }
    emp_shifts[dk] = [*emp_shifts.get(dk, []), block]
    shifts[OPEN_EMP_ID] = emp_shifts
    data["shifts"] = shifts
    plan.planner_data = json.dumps(data)


def _to_response(req: StaffRequest) -> StaffRequestResponse:
    return StaffRequestResponse(
        id=req.id,
        company_id=req.company_id,
        client_id=req.client_id,
        client_name=req.client.name if req.client else "",
        site_id=req.site_id,
        site_name=req.site.name if req.site else "",
        requested_by_user_id=req.requested_by_user_id,
        requested_by_name=req.requested_by.full_name if req.requested_by else "",
        shift_date=req.shift_date,
        shift_start=req.shift_start,
        shift_end=req.shift_end,
        break_minutes=req.break_minutes or 0,
        staff_count=req.staff_count or 1,
        client_notes=req.client_notes,
        status=req.status,
        reviewer_user_id=req.reviewer_user_id,
        reviewer_name=req.reviewer.full_name if req.reviewer else None,
        reviewer_comment=req.reviewer_comment,
        reviewed_at=req.reviewed_at,
        rota_plan_id=req.rota_plan_id,
        created_at=req.created_at,
    )


def _can_review(db: Session, user: User) -> bool:
    return user_has_permission_db(db, user, PERM_STAFF_REQ_REVIEW)


def _resolve_client_id(db: Session, user: User, data: StaffRequestCreate) -> int:
    if user.client_id:
        return user.client_id
    if data.client_id:
        company = get_company_by_user_id(db, user.id)
        client = db.query(Client).filter(Client.id == data.client_id, Client.company_id == company.id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        return client.id
    raise HTTPException(status_code=400, detail="Client is required for this request")


def create_staff_request(db: Session, user: User, data: StaffRequestCreate) -> StaffRequestResponse:
    company = get_company_by_user_id(db, user.id)
    client_id = _resolve_client_id(db, user, data)
    site = (
        db.query(Site)
        .filter(Site.id == data.site_id, Site.company_id == company.id)
        .first()
    )
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    req = StaffRequest(
        company_id=company.id,
        client_id=client_id,
        site_id=site.id,
        requested_by_user_id=user.id,
        shift_date=data.shift_date,
        shift_start=data.shift_start,
        shift_end=data.shift_end,
        break_minutes=data.break_minutes,
        staff_count=data.staff_count,
        client_notes=(data.client_notes or "").strip() or None,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _load_one(db, company.id, req.id)


def list_staff_requests(
    db: Session,
    user: User,
    status: Optional[str] = None,
) -> List[StaffRequestResponse]:
    company = get_company_by_user_id(db, user.id)
    q = (
        db.query(StaffRequest)
        .options(
            joinedload(StaffRequest.client),
            joinedload(StaffRequest.site),
            joinedload(StaffRequest.requested_by),
            joinedload(StaffRequest.reviewer),
        )
        .filter(StaffRequest.company_id == company.id)
    )
    if status:
        q = q.filter(StaffRequest.status == status)
    if not _can_review(db, user):
        if user.client_id:
            q = q.filter(StaffRequest.client_id == user.client_id)
        else:
            q = q.filter(StaffRequest.requested_by_user_id == user.id)
    rows = q.order_by(StaffRequest.created_at.desc()).all()
    return [_to_response(r) for r in rows]


def _load_one(db: Session, company_id: int, req_id: int) -> StaffRequestResponse:
    req = (
        db.query(StaffRequest)
        .options(
            joinedload(StaffRequest.client),
            joinedload(StaffRequest.site),
            joinedload(StaffRequest.requested_by),
            joinedload(StaffRequest.reviewer),
        )
        .filter(StaffRequest.id == req_id, StaffRequest.company_id == company_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return _to_response(req)


def get_staff_request(db: Session, user: User, req_id: int) -> StaffRequestResponse:
    company = get_company_by_user_id(db, user.id)
    req = (
        db.query(StaffRequest)
        .options(
            joinedload(StaffRequest.client),
            joinedload(StaffRequest.site),
            joinedload(StaffRequest.requested_by),
            joinedload(StaffRequest.reviewer),
        )
        .filter(StaffRequest.id == req_id, StaffRequest.company_id == company.id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _can_review(db, user):
        if user.client_id and req.client_id != user.client_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not user.client_id and req.requested_by_user_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    return _to_response(req)


def approve_staff_request(db: Session, user: User, req_id: int, body: StaffRequestReview) -> StaffRequestResponse:
    if not _can_review(db, user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    company = get_company_by_user_id(db, user.id)
    req = (
        db.query(StaffRequest)
        .options(joinedload(StaffRequest.site), joinedload(StaffRequest.client))
        .filter(StaffRequest.id == req_id, StaffRequest.company_id == company.id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already reviewed")
    plan = _find_or_create_plan(db, company.id, req.shift_date)
    site_name = req.site.name if req.site else ""
    label = f"{req.client.name[:12]}" if req.client else "Client req"
    notes = req.client_notes or ""
    if body.comment:
        notes = f"{notes}\n[Approved] {body.comment}".strip() if notes else f"[Approved] {body.comment}"
    for _ in range(max(1, req.staff_count or 1)):
        _append_shift_to_plan(
            plan,
            req.shift_date,
            site_name,
            req.shift_start,
            req.shift_end,
            req.break_minutes or 0,
            notes,
            label,
        )
    req.status = "approved"
    req.reviewer_user_id = user.id
    req.reviewer_comment = (body.comment or "").strip() or None
    req.reviewed_at = datetime.now(timezone.utc)
    req.rota_plan_id = plan.id
    db.commit()
    return _load_one(db, company.id, req.id)


def reject_staff_request(db: Session, user: User, req_id: int, body: StaffRequestReview) -> StaffRequestResponse:
    if not _can_review(db, user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    company = get_company_by_user_id(db, user.id)
    req = db.query(StaffRequest).filter(StaffRequest.id == req_id, StaffRequest.company_id == company.id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already reviewed")
    req.status = "rejected"
    req.reviewer_user_id = user.id
    req.reviewer_comment = (body.comment or "").strip() or None
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return _load_one(db, company.id, req.id)
