import logging

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.worker_jobs import (
    scheduled_maintenance,
    check_missed_patrols,
    sweep_lone_worker,
    sweep_trials,
    sweep_renewal_invoices,
    sweep_finance_recurring,
    snapshot_server_metrics,
    sweep_shift_reminders,
)

logging.basicConfig(level=logging.INFO)

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    # Idempotent sweeps: prefer skip/next tick over retry storms after a failure.
    max_tries = 1
    job_timeout = 300
    functions = [
        check_missed_patrols,
        sweep_lone_worker,
        sweep_trials,
        sweep_renewal_invoices,
        sweep_finance_recurring,
        snapshot_server_metrics,
        sweep_shift_reminders,
    ]
    # unique=True: skip enqueue if the same job is already queued/running (overlap guard).
    cron_jobs = [
        cron(scheduled_maintenance, hour=3, minute=0, unique=True, timeout=600, max_tries=1),
        cron(check_missed_patrols, minute=set(range(60)), unique=True, timeout=240, max_tries=1),
        cron(sweep_lone_worker, minute=set(range(60)), unique=True, timeout=240, max_tries=1),
        cron(sweep_shift_reminders, minute=set(range(60)), unique=True, timeout=240, max_tries=1),
        cron(sweep_trials, minute={0}, unique=True, timeout=300, max_tries=1),
        cron(sweep_renewal_invoices, hour=4, minute=15, unique=True, timeout=600, max_tries=1),
        cron(sweep_finance_recurring, hour=5, minute=0, unique=True, timeout=600, max_tries=1),
        # Every 5 minutes for historical host/API charts in Super Admin monitoring.
        cron(snapshot_server_metrics, minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55}, unique=True, timeout=120, max_tries=1),
    ]
