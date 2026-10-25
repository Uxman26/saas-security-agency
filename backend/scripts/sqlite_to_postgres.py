import sys
import warnings
warnings.filterwarnings("ignore", message="Cannot correctly sort tables")
from sqlalchemy import create_engine, inspect, select, func, text, Integer, String
from app.database import Base, engine as pg
import app.models

if len(sys.argv) < 2 or pg.dialect.name != "postgresql":
    sys.exit("usage: DATABASE_URL=postgresql://... python scripts/sqlite_to_postgres.py /path/to/security.db")

src = create_engine(f"sqlite:///{sys.argv[1]}")
src_cols = {t: {c["name"] for c in inspect(src).get_columns(t)} for t in inspect(src).get_table_names()}

Base.metadata.create_all(pg)

with pg.connect() as c:
    filled = [t.name for t in Base.metadata.sorted_tables if c.execute(select(func.count()).select_from(t)).scalar()]
if filled:
    sys.exit(f"target not empty, aborting: {filled[:10]}")


def clean(v):
    return v.replace("\x00", "") if isinstance(v, str) else v


bad = []
with src.connect() as s, pg.begin() as d:
    d.execute(text("SET session_replication_role = replica"))
    for t in Base.metadata.sorted_tables:
        cols = [c for c in t.columns if c.name in src_cols.get(t.name, ())]
        missing = [c.name for c in t.columns if c not in cols]
        if missing:
            print(f"  {t.name}: not in sqlite, using defaults -> {missing}")
        n = 0
        for chunk in s.execution_options(stream_results=True).execute(select(*cols)).partitions(2000):
            rows = [{k: clean(v) for k, v in r._mapping.items()} for r in chunk]
            for r in rows:
                for c in cols:
                    if isinstance(c.type, String) and c.type.length and isinstance(r[c.name], str) and len(r[c.name]) > c.type.length:
                        bad.append((t.name, c.name, len(r[c.name])))
            d.execute(t.insert(), rows)
            n += len(rows)
        print(f"{t.name}: {n}")
    if bad:
        raise SystemExit(f"values longer than column length (nothing committed): {sorted(set(bad))[:20]}")
    d.execute(text("SET session_replication_role = DEFAULT"))
    for t in Base.metadata.sorted_tables:
        pk = list(t.primary_key.columns)
        if len(pk) == 1 and isinstance(pk[0].type, Integer):
            d.execute(text(
                f"SELECT setval(pg_get_serial_sequence('\"{t.name}\"', '{pk[0].name}'), "
                f"COALESCE((SELECT MAX(\"{pk[0].name}\") FROM \"{t.name}\"), 0) + 1, false) "
                f"WHERE pg_get_serial_sequence('\"{t.name}\"', '{pk[0].name}') IS NOT NULL"
            ))

mismatch = []
with src.connect() as s, pg.connect() as d:
    for t in Base.metadata.sorted_tables:
        a = s.execute(text(f'SELECT COUNT(*) FROM "{t.name}"')).scalar()
        b = d.execute(select(func.count()).select_from(t)).scalar()
        if a != b:
            mismatch.append((t.name, a, b))
print("row counts match" if not mismatch else f"MISMATCH: {mismatch}")
sys.exit(1 if mismatch else 0)
