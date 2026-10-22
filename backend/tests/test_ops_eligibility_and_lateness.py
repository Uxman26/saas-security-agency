from datetime import date, datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.services.ops_feature_eligibility import windows_overlap
from app.services.rota_service import _late_minutes


def test_windows_overlap_overnight_patrol_with_evening_shift():
    assert windows_overlap("14:00", "22:15", "22:00", "06:00") is True
    assert windows_overlap("08:00", "16:00", "22:00", "06:00") is False
    assert windows_overlap("22:00", "06:00", "22:00", "06:00") is True
    assert windows_overlap("06:00", "14:00", "22:00", "06:00") is False


def test_late_minutes_converts_utc_booked_at_to_company_zone():
    assignment = SimpleNamespace(date=date(2026, 10, 22), shift_start="14:20")
    att = SimpleNamespace(
        status="late",
        booked_at=datetime(2026, 10, 22, 13, 35, tzinfo=timezone.utc),
    )
    london = ZoneInfo("Europe/London")
    assert _late_minutes(assignment, att, None, zone=london) == 15


def test_late_minutes_grace_and_on_time_are_not_late():
    assignment = SimpleNamespace(date=date(2026, 10, 22), shift_start="14:20")
    on_time = SimpleNamespace(
        status="on_time",
        booked_at=datetime(2026, 10, 22, 13, 20, tzinfo=timezone.utc),
    )
    early = SimpleNamespace(
        status="on_time",
        booked_at=datetime(2026, 10, 22, 13, 10, tzinfo=timezone.utc),
    )
    london = ZoneInfo("Europe/London")
    assert _late_minutes(assignment, on_time, None, zone=london) is None
    assert _late_minutes(assignment, early, None, zone=london) is None


def test_late_minutes_prefers_shift_late_log():
    assignment = SimpleNamespace(date=date(2026, 10, 22), shift_start="14:20")
    att = SimpleNamespace(
        status="early_leave",
        booked_at=datetime(2026, 10, 22, 13, 40, tzinfo=timezone.utc),
    )
    log = SimpleNamespace(late_minutes=18)
    assert _late_minutes(assignment, att, log) == 18
