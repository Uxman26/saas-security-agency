from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.services.shift_clock import attendance_if_unmarked, shift_has_started

LONDON = ZoneInfo("Europe/London")


def test_shift_later_today_has_not_started():
    now = datetime(2026, 11, 6, 14, 39, tzinfo=LONDON)
    assert shift_has_started(date(2026, 11, 6), "20:00", now) is False
    assert attendance_if_unmarked(date(2026, 11, 6), "20:00", now) == "scheduled"


def test_shift_that_has_started_today_is_pending():
    now = datetime(2026, 11, 6, 20, 1, tzinfo=LONDON)
    assert attendance_if_unmarked(date(2026, 11, 6), "20:00", now) == "pending"


def test_previous_day_with_no_mark_is_absent():
    now = datetime(2026, 11, 6, 14, 39, tzinfo=LONDON)
    assert attendance_if_unmarked(date(2026, 11, 5), "20:00", now) == "absent"


def test_future_day_stays_scheduled():
    now = datetime(2026, 11, 6, 14, 39, tzinfo=LONDON)
    assert attendance_if_unmarked(date(2026, 11, 7), "08:00", now) == "scheduled"


def test_marked_status_still_wins():
    from types import SimpleNamespace

    from app.services.rota_service import _attendance_status

    assignment = SimpleNamespace(date=date(2026, 11, 6), shift_start="20:00")
    att = SimpleNamespace(status="on_time", booked_at=datetime(2026, 11, 6, 20, 2, tzinfo=LONDON), booked_off_at=None)
    now = datetime(2026, 11, 6, 14, 39, tzinfo=LONDON)
    assert _attendance_status(assignment, att, None, date(2026, 11, 6), now=now) == "on_time"
