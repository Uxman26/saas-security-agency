"""Add missing incident and occurrence form metadata columns.

Revision ID: 20261127_form_metadata
Revises: 20261126_town_city
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20261127_form_metadata"
down_revision = "20261126_town_city"
branch_labels = None
depends_on = None


_COLUMNS = (
    ("incidents", sa.Column("checked_by", sa.String(), nullable=True)),
    ("incidents", sa.Column("signature_name", sa.String(), nullable=True)),
    ("incidents", sa.Column("signature_data", sa.Text(), nullable=True)),
    ("accident_reports", sa.Column("checked_by", sa.String(), nullable=True)),
    ("accident_reports", sa.Column("signature_name", sa.String(), nullable=True)),
    ("accident_reports", sa.Column("signature_data", sa.Text(), nullable=True)),
    ("occurrence_sheets", sa.Column("checked_by", sa.String(), nullable=True)),
    ("occurrence_sheets", sa.Column("signature_data", sa.Text(), nullable=True)),
    (
        "occurrence_entries",
        sa.Column("informed_manager", sa.Boolean(), nullable=False, server_default=sa.false()),
    ),
    (
        "occurrence_entries",
        sa.Column("informed_company", sa.Boolean(), nullable=False, server_default=sa.false()),
    ),
    (
        "occurrence_entries",
        sa.Column("informed_client", sa.Boolean(), nullable=False, server_default=sa.false()),
    ),
)


def upgrade() -> None:
    bind = op.get_bind()
    for table, column in _COLUMNS:
        inspector = sa.inspect(bind)
        if not inspector.has_table(table):
            raise RuntimeError(f"Required table {table!r} is missing")
        existing = {item["name"] for item in inspector.get_columns(table)}
        if column.name not in existing:
            op.add_column(table, column)


def downgrade() -> None:
    bind = op.get_bind()
    for table, column in reversed(_COLUMNS):
        inspector = sa.inspect(bind)
        if inspector.has_table(table):
            existing = {item["name"] for item in inspector.get_columns(table)}
            if column.name in existing:
                op.drop_column(table, column.name)
