"""Migrate legacy shift_type 'day' to morning/afternoon/evening/night.

Revision ID: 20261019_day_shift
Revises: 20240511_unified_contractors
Create Date: 2026-10-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20261019_day_shift"
down_revision = "20240511_unified_contractors"
branch_labels = None
depends_on = None


def _infer(start: str | None) -> str:
    if not start:
        return "morning"
    raw = str(start).strip()
    if "T" in raw:
        raw = raw.split("T", 1)[1]
    raw = raw.split("Z")[0].split("+")[0].split(".")[0]
    parts = raw.split(":")
    try:
        hour = int(parts[0])
    except (ValueError, IndexError):
        return "morning"
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


def upgrade() -> None:
    conn = op.get_bind()
    # assignments
    rows = conn.execute(sa.text("SELECT id, shift_start FROM assignments WHERE lower(coalesce(shift_type, '')) = 'day'")).fetchall()
    for row in rows:
        new_type = _infer(row[1] if len(row) > 1 else None)
        conn.execute(
            sa.text("UPDATE assignments SET shift_type = :st WHERE id = :id"),
            {"st": new_type, "id": row[0]},
        )
    # site_rates (legacy day rates → morning)
    try:
        conn.execute(sa.text("UPDATE site_rates SET shift_type = 'morning' WHERE lower(coalesce(shift_type, '')) = 'day'"))
    except Exception:
        pass
    try:
        conn.execute(sa.text("UPDATE guard_rates SET shift_type = 'morning' WHERE lower(coalesce(shift_type, '')) = 'day'"))
    except Exception:
        pass


def downgrade() -> None:
    # Irreversible without losing morning/afternoon/evening distinctions.
    pass
