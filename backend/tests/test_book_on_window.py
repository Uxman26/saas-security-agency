from datetime import date, datetime, time, timedelta

from app.services.attendance_service import EARLY_BOOK_ON_MINUTES, _assignment_shift_start_dt


class _A:
    def __init__(self, day, shift_start):
        self.date = day
        self.shift_start = shift_start


def test_early_book_on_minutes_is_20():
    assert EARLY_BOOK_ON_MINUTES == 20


def test_assignment_shift_start_dt_parses_hm():
    a = _A(date(2026, 10, 16), "20:00")
    assert _assignment_shift_start_dt(a) == datetime(2026, 10, 16, 20, 0)


def test_early_window_boundary():
    a = _A(date(2026, 10, 16), "20:00")
    start = _assignment_shift_start_dt(a)
    earliest = start - timedelta(minutes=EARLY_BOOK_ON_MINUTES)
    assert earliest == datetime.combine(date(2026, 10, 16), time(19, 40))
    assert datetime(2026, 10, 16, 19, 39) < earliest
    assert datetime(2026, 10, 16, 19, 40) >= earliest


def test_assignment_shift_start_dt_invalid():
    assert _assignment_shift_start_dt(_A(date(2026, 10, 16), None)) is None
    assert _assignment_shift_start_dt(_A(date(2026, 10, 16), "xx")) is None
