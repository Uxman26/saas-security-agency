from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")


def london_now() -> datetime:
    return datetime.now(LONDON)


def _minutes(shift_start: str | None) -> int:
    raw = (shift_start or "").strip()
    if "T" in raw:
        raw = raw.split("T", 1)[1]
    raw = raw[:5]
    if not raw:
        return 0
    parts = raw.split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return 0
    if hour < 0 or minute < 0:
        return 0
    return hour * 60 + minute


def shift_has_started(shift_date: date, shift_start: str | None, now: datetime) -> bool:
    local = now.astimezone(now.tzinfo or LONDON)
    if shift_date > local.date():
        return False
    if shift_date < local.date():
        return True
    return local.hour * 60 + local.minute >= _minutes(shift_start)


def attendance_if_unmarked(shift_date: date, shift_start: str | None, now: datetime) -> str:
    if not shift_has_started(shift_date, shift_start, now):
        return "scheduled"
    local = now.astimezone(now.tzinfo or LONDON)
    if shift_date < local.date():
        return "absent"
    return "pending"
