import logging

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.worker_jobs import scheduled_maintenance, check_missed_patrols, sweep_lone_worker, sweep_trials, sweep_renewal_invoices

logging.basicConfig(level=logging.INFO)

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [check_missed_patrols, sweep_lone_worker, sweep_trials, sweep_renewal_invoices]
    cron_jobs = [
        cron(scheduled_maintenance, hour=3, minute=0),
        cron(check_missed_patrols, minute=set(range(60))),
        cron(sweep_lone_worker, minute=set(range(60))),
        cron(sweep_trials, minute={0}),
        cron(sweep_renewal_invoices, hour=4, minute=15),
    ]
