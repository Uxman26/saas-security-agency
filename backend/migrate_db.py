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
    if table_exists(cur, "companies") and not table_exists(cur, "main_contractors"):
        try:
            cur.execute(
                """CREATE TABLE main_contractors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                name TEXT NOT NULL,
                contact_person TEXT,
                phone TEXT,
                email TEXT,
                address TEXT,
                registration_number TEXT,
                contract_start_date TEXT,
                contract_end_date TEXT,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
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
        ("guards", "weekly_contracted_hours", "REAL DEFAULT 40"),
        ("guards", "main_contractor_id", "INTEGER REFERENCES main_contractors(id)"),
        ("guards", "sub_contractor_id", "INTEGER REFERENCES sub_contractors(id)"),
        ("sites", "main_contractor_id", "INTEGER REFERENCES main_contractors(id)"),
        ("sites", "sub_contractor_id", "INTEGER REFERENCES sub_contractors(id)"),
        ("sub_contractors", "main_contractor_id", "INTEGER REFERENCES main_contractors(id)"),
        ("sub_contractors", "registration_number", "TEXT"),
        ("sub_contractors", "contract_start_date", "TEXT"),
        ("sub_contractors", "contract_end_date", "TEXT"),
        ("sub_contractors", "status", "TEXT DEFAULT 'active'"),
        ("companies", "logo_path", "TEXT"),
        ("invoices", "due_date", "TEXT"),
        ("invoices", "notes", "TEXT"),
        ("invoices", "subtotal", "REAL DEFAULT 0"),
        ("invoices", "tax_rate", "REAL DEFAULT 0"),
        ("invoices", "tax_amount", "REAL DEFAULT 0"),
    ]
    for table, col, spec in alters:
        if table_exists(cur, table) and not column_exists(cur, table, col):
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {spec}")
            except sqlite3.OperationalError:
                pass
    if table_exists(cur, "companies") and not table_exists(cur, "special_days"):
        try:
            cur.execute(
                """CREATE TABLE special_days (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                date TEXT NOT NULL,
                label TEXT NOT NULL,
                UNIQUE(company_id, date)
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "clients") and not column_exists(cur, "clients", "double_rate_special_days"):
        try:
            cur.execute("ALTER TABLE clients ADD COLUMN double_rate_special_days INTEGER NOT NULL DEFAULT 0")
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "invoices") and column_exists(cur, "invoices", "subtotal"):
        try:
            cur.execute(
                "UPDATE invoices SET subtotal = total WHERE (subtotal IS NULL OR subtotal = 0) AND total IS NOT NULL AND total != 0"
            )
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
    if table_exists(cur, "sub_contractors") and column_exists(cur, "sub_contractors", "registration_number") and column_exists(cur, "sub_contractors", "license_number"):
        try:
            cur.execute(
                "UPDATE sub_contractors SET registration_number = license_number WHERE (registration_number IS NULL OR registration_number = '') AND license_number IS NOT NULL"
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "companies") and not table_exists(cur, "roles"):
        try:
            cur.execute(
                """CREATE TABLE roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                is_system INTEGER NOT NULL DEFAULT 0,
                permissions_json TEXT NOT NULL DEFAULT '{}',
                UNIQUE(company_id, slug)
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "users") and not column_exists(cur, "users", "role_id"):
        try:
            cur.execute("ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)")
        except sqlite3.OperationalError:
            pass
    conn.commit()
    conn.close()
    try:
        from app.database import SessionLocal
        from app.services.role_service import backfill_user_roles

        db = SessionLocal()
        try:
            backfill_user_roles(db)
        finally:
            db.close()
    except Exception:
        pass

if __name__ == "__main__":
    run()
