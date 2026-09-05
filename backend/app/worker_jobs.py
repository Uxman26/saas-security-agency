import asyncio
import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Guard

logger = logging.getLogger("arq.worker")

def _track_job(job_name: str, fn):
    def wrapped() -> dict[str, Any]:
        from app.models import BackgroundJob
        from datetime import datetime, timezone

        db: Session = SessionLocal()
        row = BackgroundJob(job_name=job_name, queue="cron", status="running", started_at=datetime.now(timezone.utc), attempts=1)
        db.add(row)
        db.commit()
        db.refresh(row)
        try:
            result = fn()
            row.status = "completed"
            row.result_json = str(result)[:4000]
            row.finished_at = datetime.now(timezone.utc)
            db.commit()
            return result
        except Exception as e:
            row.status = "failed"
            row.error_message = str(e)[:1000]
            row.finished_at = datetime.now(timezone.utc)
            db.commit()
            raise
        finally:
            db.close()

    return wrapped


def _scheduled_maintenance_sync() -> dict[str, Any]:
    def run():
        db: Session = SessionLocal()
        try:
            today = date.today()
            soon = today + timedelta(days=30)
            q = (
                db.query(Guard)
                .filter(Guard.sia_expiry_date.isnot(None))
                .filter(Guard.sia_expiry_date <= soon)
            )
            due = q.count()
            logger.info("maintenance: guards with SIA expiry within 30 days: %s", due)

            from app.services import session_service

            purged = session_service.purge_expired(db)
            logger.info("maintenance: purged %s dead sessions", purged)
            try:
                from app.services import gdpr_service
                gdpr_service.purge_expired_logs(db)
            except Exception:
                logger.exception("retention purge failed")
            try:
                from app.services import suspicious_activity_service
                suspicious_activity_service.scan_suspicious_activity(db)
            except Exception:
                logger.exception("suspicious scan failed")
            return {"sia_expiry_due_count": due, "sessions_purged": purged}
        finally:
            db.close()

    return _track_job("scheduled_maintenance", run)()


async def scheduled_maintenance(ctx: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_scheduled_maintenance_sync)


def _check_missed_patrols_sync() -> dict[str, Any]:
    def run():
        db: Session = SessionLocal()
        try:
            from app.services import patrol_service

            result = patrol_service.detect_missed_patrols(db)
            logger.info("missed patrols: %s", result)
            return result
        finally:
            db.close()

    return _track_job("check_missed_patrols", run)()


async def check_missed_patrols(ctx: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_check_missed_patrols_sync)


def _sweep_lone_worker_sync() -> dict[str, Any]:
    def run():
        db: Session = SessionLocal()
        try:
            from app.services import lone_worker_service

            result = lone_worker_service.sweep(db)
            if any(result.values()):
                logger.info("lone worker sweep: %s", result)
            return result
        finally:
            db.close()

    return _track_job("sweep_lone_worker", run)()


async def sweep_lone_worker(ctx: dict[str, Any]) -> dict[str, Any]:
    return await asyncio.to_thread(_sweep_lone_worker_sync)
