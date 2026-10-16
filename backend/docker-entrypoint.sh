#!/bin/sh
# Never let migrations block the API from starting — a failed migrate used to
# exit this script (set -e) and leave nginx returning 502 on every /api call,
# which the web login UI surfaced as a generic "Request failed".
mkdir -p /app/data /app/uploads
python - <<'PY' || echo "WARNING: database init/migrate failed; starting API anyway" >&2
from app.database import engine, Base
Base.metadata.create_all(bind=engine)
from migrate_db import run
run()
PY
exec "$@"
