import sqlite3
import os
from app.config import settings

def get_db_path():
    url = settings.database_url
    if url.startswith("sqlite:///"):
        path = url.replace("sqlite:///", "").split("?")[0]
        if not os.path.isabs(path):
            path = os.path.abspath(path)
        return path
    return None

def column_exists(cursor, table, col):
    cursor.execute(f"PRAGMA table_info({table})")
    return any(r[1] == col for r in cursor.fetchall())

def table_exists(cursor, table):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cursor.fetchone() is not None

def run():
    path = get_db_path()
    if not path or not os.path.exists(path):
        return
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    alters = [
        ("users", "role", "TEXT DEFAULT 'company_admin'"),
        ("users", "company_id", "INTEGER REFERENCES companies(id)"),
        ("users", "updated_at", "TEXT"),
        ("companies", "subscription_tier", "TEXT DEFAULT 'basic'"),
        ("companies", "stripe_customer_id", "TEXT"),
        ("companies", "updated_at", "TEXT"),
        ("guards", "sia_number", "TEXT"),
        ("guards", "sia_expiry_date", "TEXT"),
        ("guards", "visa_status", "TEXT"),
        ("guards", "rtw_status", "TEXT"),
        ("guards", "employment_history", "TEXT"),
        ("guards", "updated_at", "TEXT"),
        ("clients", "updated_at", "TEXT"),
        ("sites", "client_id", "INTEGER REFERENCES clients(id)"),
        ("sites", "default_hourly_rate", "REAL"),
        ("sites", "updated_at", "TEXT"),
        ("assignments", "break_minutes", "INTEGER DEFAULT 0"),
        ("assignments", "shift_type", "TEXT DEFAULT 'day'"),
        ("assignments", "updated_at", "TEXT"),
        ("sub_contractors", "updated_at", "TEXT"),
        ("guards", "dbs_status", "TEXT"),
    ]
    for table, col, spec in alters:
        if table_exists(cur, table) and not column_exists(cur, table, col):
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {spec}")
            except sqlite3.OperationalError:
                pass
    if table_exists(cur, "companies") and not table_exists(cur, "audit_logs"):
        try:
            cur.execute(
                """CREATE TABLE audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER REFERENCES companies(id),
                user_id INTEGER REFERENCES users(id),
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id INTEGER,
                meta TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    conn.commit()
    conn.close()

if __name__ == "__main__":
    run()
