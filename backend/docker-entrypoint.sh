#!/bin/sh
set -e
mkdir -p /app/data
python -c "
from app.database import engine, Base
Base.metadata.create_all(bind=engine)
from migrate_db import run
run()
"
exec "$@"
