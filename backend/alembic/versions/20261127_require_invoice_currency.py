"""Require currency on invoices and recurring invoices.

Revision ID: 20261127_currency_not_null
Revises: 20261127_form_metadata
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20261127_currency_not_null"
down_revision = "20261127_form_metadata"
branch_labels = None
depends_on = None


_TABLES = ("invoices", "recurring_invoices")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in _TABLES:
        if not inspector.has_table(table):
            raise RuntimeError(f"Required table {table!r} is missing")
        columns = {column["name"] for column in inspector.get_columns(table)}
        if "currency" not in columns:
            raise RuntimeError(f"Required column {table}.currency is missing")
        bind.execute(
            sa.text(
                f"UPDATE {table} SET currency = 'GBP' "
                "WHERE currency IS NULL OR btrim(currency) = ''"
            )
        )
        op.alter_column(
            table,
            "currency",
            existing_type=sa.String(length=8),
            nullable=False,
        )


def downgrade() -> None:
    for table in _TABLES:
        op.alter_column(
            table,
            "currency",
            existing_type=sa.String(length=8),
            nullable=True,
        )
