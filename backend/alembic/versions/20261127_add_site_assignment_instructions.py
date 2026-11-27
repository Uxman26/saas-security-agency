"""Add structured site assignment instructions.

Revision ID: 20261127_site_instructions
Revises: 20261127_currency_not_null
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20261127_site_instructions"
down_revision = "20261127_currency_not_null"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("sites"):
        raise RuntimeError("Required table 'sites' is missing")
    columns = {column["name"] for column in inspector.get_columns("sites")}
    if "assignment_instructions" not in columns:
        op.add_column(
            "sites",
            sa.Column("assignment_instructions", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("sites"):
        columns = {column["name"] for column in inspector.get_columns("sites")}
        if "assignment_instructions" in columns:
            op.drop_column("sites", "assignment_instructions")
