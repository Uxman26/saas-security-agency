from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.attendance_service import gps_verified_for, parse_gps_accuracy_m
from app.services.rota_service import _attendance_status
from app.services.shift_reminder_service import should_send_shift_reminder


def test_parse_accuracy_from_gps_note():
    note = "GPS The Hive (51.507400,-0.127800) ±13.1m @ 2026-10-22T13:20:00+00:00"
    assert parse_gps_accuracy_m(note) == 13.1
    assert parse_gps_accuracy_m(note, 12.0) == 12.0


def test_gps_verified_requires_accurate_in_range_fix():
    site = SimpleNamespace(latitude=51.5, longitude=-0.12, geofence_radius_m=150)
    assert gps_verified_for(51.5001, -0.1201, 13.1, site) is True
    assert gps_verified_for(51.5001, -0.1201, 40.0, site) is False
    assert gps_verified_for(None, None, 13.1, site) is False
    assert gps_verified_for(None, None, None, site) is None


def test_rota_status_clocked_out_is_completed():
    assignment = SimpleNamespace(date=datetime(2026, 10, 22).date())
    att = SimpleNamespace(
        status="on_time",
        booked_at=datetime(2026, 10, 22, 13, 20, tzinfo=timezone.utc),
        booked_off_at=datetime(2026, 10, 22, 21, 0, tzinfo=timezone.utc),
    )
    assert _attendance_status(assignment, att, None, datetime(2026, 10, 22).date()) == "booked_off"

    early = SimpleNamespace(
        status="early_leave",
        booked_at=datetime(2026, 10, 22, 13, 20, tzinfo=timezone.utc),
        booked_off_at=datetime(2026, 10, 22, 20, 0, tzinfo=timezone.utc),
    )
    assert _attendance_status(assignment, early, None, datetime(2026, 10, 22).date()) == "early_leave"


def test_shift_reminder_window_is_before_start_not_after():
    start = datetime(2026, 10, 22, 13, 20, tzinfo=timezone.utc)
    assert should_send_shift_reminder(
        now_utc=datetime(2026, 10, 22, 13, 0, tzinfo=timezone.utc),
        start_utc=start,
    )
    assert not should_send_shift_reminder(
        now_utc=datetime(2026, 10, 22, 12, 50, tzinfo=timezone.utc),
        start_utc=start,
    )
    assert not should_send_shift_reminder(
        now_utc=datetime(2026, 10, 22, 13, 20, tzinfo=timezone.utc),
        start_utc=start,
    )
