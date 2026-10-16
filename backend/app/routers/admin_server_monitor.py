from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services import server_monitor_service
from app.services.platform_rbac_service import require_platform_perm

router = APIRouter(prefix="/admin/server-monitor", tags=["admin-server-monitor"])


@router.get("/report")
def server_monitor_report(
    hours: int = Query(24, ge=1, le=24 * 90),
    company_id: Optional[int] = None,
    tier: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("ops.read")),
):
    return server_monitor_service.full_report(
        db, hours=hours, company_id=company_id, tier=tier
    )


@router.get("/host")
def server_monitor_host(
    _: User = Depends(require_platform_perm("ops.read")),
):
    return {
        "host": server_monitor_service.host_metrics(),
        "redis": server_monitor_service.redis_status(),
    }


@router.get("/tenants")
def server_monitor_tenants(
    hours: int = Query(24, ge=1, le=24 * 90),
    company_id: Optional[int] = None,
    tier: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("ops.read")),
):
    return server_monitor_service.tenant_usage_breakdown(
        db, hours=hours, company_id=company_id, tier=tier
    )


@router.get("/history")
def server_monitor_history(
    hours: int = Query(24, ge=1, le=24 * 14),
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("ops.read")),
):
    return {"hours": hours, "points": server_monitor_service.history(db, hours=hours)}


@router.get("/thresholds")
def get_thresholds(
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("ops.read")),
):
    return server_monitor_service.get_thresholds(db)


@router.put("/thresholds")
def put_thresholds(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_platform_perm("ops.write")),
):
    return server_monitor_service.update_thresholds(db, body, current_user)


@router.post("/snapshot")
def take_snapshot(
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("ops.write")),
):
    return server_monitor_service.snapshot_and_store(db)


@router.get("/export.csv")
def export_csv(
    hours: int = Query(24, ge=1, le=24 * 90),
    company_id: Optional[int] = None,
    tier: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_platform_perm("ops.read")),
):
    data = server_monitor_service.tenant_usage_breakdown(
        db, hours=hours, company_id=company_id, tier=tier
    )
    headers = [
        "company_id",
        "company_name",
        "subscription_tier",
        "subscription_status",
        "api_requests",
        "api_requests_per_minute",
        "api_failed",
        "api_avg_duration_ms",
        "api_peak_duration_ms",
        "active_users",
        "concurrent_sessions",
        "background_jobs",
        "logo_storage_mb",
    ]

    def cell(v):
        s = "" if v is None else str(v)
        if any(c in s for c in (",", '"', "\n")):
            return '"' + s.replace('"', '""') + '"'
        return s

    def gen():
        yield ",".join(headers) + "\n"
        for t in data.get("tenants") or []:
            yield ",".join(cell(t.get(h)) for h in headers) + "\n"

    filename = f"server-monitor-tenants-{datetime.utcnow().strftime('%Y%m%d%H%M')}.csv"
    return StreamingResponse(
        gen(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
