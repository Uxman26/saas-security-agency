"""Currency columns must exist for invoice / recurring-invoice list endpoints."""

from __future__ import annotations

import sqlite3

import pytest
from sqlalchemy import inspect, text


@pytest.fixture()
def broken_currency_db(tmp_path, monkeypatch):
    path = tmp_path / "broken_currency.db"
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE invoices (
            id INTEGER PRIMARY KEY,
            company_id INTEGER,
            client_id INTEGER,
            period_start TEXT,
            period_end TEXT,
            total REAL,
            status TEXT,
            pdf_path TEXT,
            created_at TEXT,
            updated_at TEXT,
            deleted_at TEXT
        );
        CREATE TABLE recurring_invoices (
            id INTEGER PRIMARY KEY,
            company_id INTEGER,
            client_id INTEGER,
            site_id INTEGER,
            frequency TEXT,
            day_of_month INTEGER,
            start_date TEXT,
            end_date TEXT,
            next_run TEXT,
            tax_rate REAL,
            notes TEXT,
            template_json TEXT,
            status TEXT,
            last_invoice_id INTEGER,
            created_at TEXT
        );
        INSERT INTO invoices (id, company_id, period_start, period_end, total, status)
        VALUES (1, 1, '2026-01-01', '2026-01-31', 10, 'sent');
        INSERT INTO recurring_invoices (
            id, company_id, frequency, day_of_month, start_date, tax_rate, status, template_json
        ) VALUES (1, 1, 'monthly', 1, '2026-01-01', 20, 'active', '[]');
        """
    )
    conn.commit()
    conn.close()
    url = f"sqlite:///{path}"
    monkeypatch.setenv("DATABASE_URL", url)
    # Settings / engine are imported lazily inside the ensure helper.
    return url


def test_ensure_invoice_currency_columns_adds_missing(broken_currency_db):
    from importlib import reload

    import app.config as cfg
    import app.database as dbmod

    reload(cfg)
    reload(dbmod)

    from migrate_db import _ensure_invoice_currency_columns

    # Before: both list endpoints 500 with "no such column: currency".
    with dbmod.engine.connect() as conn:
        with pytest.raises(Exception):
            conn.execute(text("SELECT currency FROM recurring_invoices LIMIT 1"))

    _ensure_invoice_currency_columns()

    engine = dbmod.engine
    insp = inspect(engine)
    assert "currency" in {c["name"] for c in insp.get_columns("invoices")}
    assert "currency" in {c["name"] for c in insp.get_columns("recurring_invoices")}

    with engine.connect() as conn:
        assert conn.execute(text("SELECT currency FROM invoices WHERE id = 1")).scalar() == "GBP"
        assert conn.execute(text("SELECT currency FROM recurring_invoices WHERE id = 1")).scalar() == "GBP"
