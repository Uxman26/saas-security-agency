from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from app.config import settings

_connect_args = {}
_engine_options = {}
if settings.database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
    # File-backed SQLite connections are cheap. Avoid QueuePool exhaustion
    # when FastAPI handles a burst of concurrent requests.
    _engine_options["poolclass"] = NullPool

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args if _connect_args else {},
    **_engine_options,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
