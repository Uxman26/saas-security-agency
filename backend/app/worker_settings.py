import logging

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.worker_jobs import scheduled_maintenance, check_missed_patrols, sweep_lone_worker, sweep_trials

logging.basicConfig(level=logging.INFO)

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [check_missed_patrols, sweep_lone_worker, sweep_trials]
    cron_jobs = [
        cron(scheduled_maintenance, hour=3, minute=0),
        cron(check_missed_patrols, minute={0, 15, 30, 45}),
        cron(sweep_lone_worker, minute=set(range(60))),
        # Trial expiry + reminder emails — hourly is enough for day-granular trials.
        cron(sweep_trials, minute={0}),
    ]
