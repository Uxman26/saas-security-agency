import logging

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.worker_jobs import scheduled_maintenance, check_missed_patrols

logging.basicConfig(level=logging.INFO)

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [check_missed_patrols]
    cron_jobs = [
        cron(scheduled_maintenance, hour=3, minute=0),
        cron(check_missed_patrols, minute={0, 15, 30, 45}),
    ]
