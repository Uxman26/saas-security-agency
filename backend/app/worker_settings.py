import logging

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.worker_jobs import scheduled_maintenance

logging.basicConfig(level=logging.INFO)

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = []
    cron_jobs = [
        cron(scheduled_maintenance, hour=3, minute=0),
    ]
