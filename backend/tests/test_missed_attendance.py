from datetime import datetime, timedelta, timezone

from app.services.missed_attendance_service import (
    KIND_CLOCK_IN,
    KIND_CLOCK_OUT,
    should_flag_missed_clock_in,
    should_flag_missed_clock_out,
)


def test_missed_clock_in_requires_five_minute_grace():
    start = datetime(2026, 11, 18, 9, 0, tzinfo=timezone.utc)
    assert not should_flag_missed_clock_in(
        now_utc=start + timedelta(minutes=4, seconds=59),
        start_utc=start,
    )
    assert should_flag_missed_clock_in(
        now_utc=start + timedelta(minutes=5),
        start_utc=start,
    )
    assert should_flag_missed_clock_in(
        now_utc=start + timedelta(minutes=30),
        start_utc=start,
    )


def test_missed_clock_in_window_closes():
    start = datetime(2026, 11, 18, 9, 0, tzinfo=timezone.utc)
    assert not should_flag_missed_clock_in(
        now_utc=start + timedelta(hours=13),
        start_utc=start,
    )


def test_missed_clock_out_grace_after_end_including_overnight():
    end = datetime(2026, 11, 19, 6, 0, tzinfo=timezone.utc)  # overnight end
    assert not should_flag_missed_clock_out(
        now_utc=end + timedelta(minutes=4),
        end_utc=end,
    )
    assert should_flag_missed_clock_out(
        now_utc=end + timedelta(minutes=5),
        end_utc=end,
    )


def test_missed_kind_constants():
    assert KIND_CLOCK_IN == "missed_clock_in"
    assert KIND_CLOCK_OUT == "missed_clock_out"


def test_missed_clocks_route_registered_before_id_param():
    """Regression: GET missed paths must exist so they do not 405 against /{id}."""
    from app.routers import attendance as attendance_router

    paths = [
        (getattr(r, "path", "") or "", set(getattr(r, "methods", None) or []))
        for r in attendance_router.router.routes
    ]
    def has_get(suffix: str) -> bool:
        return any(p.endswith(suffix) and "GET" in methods for p, methods in paths)

    assert has_get("/missed-clocks"), "expected GET …/missed-clocks"
    assert has_get("/missed"), "expected GET …/missed alias"
