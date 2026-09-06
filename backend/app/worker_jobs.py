import asyncio
import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Guard

logger = logging.getLogger("arq.worker")

def _scheduled_maintenance_sync() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        today = date.today()
        soon = today + timedelta(days=30)
        q = (
            db.query(Guard)
            .filter(Guard.deleted_at.is_(None))
            .filter(Guard.sia_expiry_date.isnot(None))
            .filter(Guard.sia_expiry_date <= soon)
        )
        due = q.count()
        logger.info("maintenance: guards with SIA expiry within 30 days: %s", due)

        from app.services import session_service

        purged = session_service.purge_expired(db)
        logger.info("maintenance: purged %s dead sessions", purged)
        return {"sia_expiry_due_count": due, "sessions_purged": purged}
    finally:
        db.close()

async def scheduled_maintenance(ctx: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_scheduled_maintenance_sync)


def _check_missed_patrols_sync() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        from app.services import patrol_service

        result = patrol_service.detect_missed_patrols(db)
        logger.info("missed patrols: %s", result)
        return result
    finally:
        db.close()


async def check_missed_patrols(ctx: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_check_missed_patrols_sync)


def _sweep_lone_worker_sync() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        from app.services import lone_worker_service

        result = lone_worker_service.sweep(db)
        # Quiet minutes are the normal case, so only log when something actually moved.
        if any(result.values()):
            logger.info("lone worker sweep: %s", result)
        return result
    finally:
        db.close()


async def sweep_lone_worker(ctx: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_sweep_lone_worker_sync)
