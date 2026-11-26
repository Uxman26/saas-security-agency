"""Add town_city to sites, clients, contractors (and legacy main/sub).

Matches staff address field naming (guards.town_city).

Revision ID: 20261126_town_city
Revises: 20261019_day_shift
Create Date: 2026-11-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20261126_town_city"
down_revision = "20261019_day_shift"
branch_labels = None
depends_on = None

_TABLES = ("sites", "clients", "contractors", "main_contractors", "sub_contractors")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in _TABLES:
        if table not in inspector.get_table_names():
            continue
        cols = {c["name"] for c in inspector.get_columns(table)}
        if "town_city" not in cols:
            op.add_column(table, sa.Column("town_city", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in _TABLES:
        if table not in inspector.get_table_names():
            continue
        cols = {c["name"] for c in inspector.get_columns(table)}
        if "town_city" in cols:
            op.drop_column(table, "town_city")
