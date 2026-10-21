from datetime import date, datetime

from app.services.attendance_service import compute_worked_hours, scheduled_shift_hours


class _A:
    def __init__(self, day, shift_start, shift_end=None, break_minutes=0):
        self.date = day
        self.shift_start = shift_start
        self.shift_end = shift_end
        self.break_minutes = break_minutes


def test_late_clock_in_keeps_scheduled_end():
    hours = compute_worked_hours(
        shift_date=date(2026, 10, 16),
        shift_start="17:15",
        shift_end="22:15",
        break_minutes=0,
        booked_at=datetime(2026, 10, 16, 17, 45),
    )
    assert hours == 4.5


def test_scheduled_hours_unchanged_by_late_clock_in():
    a = _A(date(2026, 10, 16), "17:15", "22:15")
    assert scheduled_shift_hours(a) == 5.0


def test_early_finish_shortens_actual_hours():
    hours = compute_worked_hours(
        shift_date=date(2026, 10, 16),
        shift_start="17:15",
        shift_end="22:15",
        break_minutes=0,
        booked_at=datetime(2026, 10, 16, 17, 45),
        booked_off_at=datetime(2026, 10, 16, 21, 15),
    )
    assert hours == 3.5


def test_overtime_extends_actual_hours():
    hours = compute_worked_hours(
        shift_date=date(2026, 10, 16),
        shift_start="17:15",
        shift_end="22:15",
        break_minutes=0,
        booked_at=datetime(2026, 10, 16, 17, 15),
        overtime_end="23:15",
    )
    assert hours == 6.0


def test_early_clock_in_is_capped_for_pay():
    actual = compute_worked_hours(
        shift_date=date(2026, 10, 16),
        shift_start="17:15",
        shift_end="22:15",
        break_minutes=0,
        booked_at=datetime(2026, 10, 16, 17, 0),
    )
    payable = compute_worked_hours(
        shift_date=date(2026, 10, 16),
        shift_start="17:15",
        shift_end="22:15",
        break_minutes=0,
        booked_at=datetime(2026, 10, 16, 17, 0),
        cap_early_start=True,
    )
    assert actual == 5.25
    assert payable == 5.0


def test_unpaid_break_is_deducted():
    hours = compute_worked_hours(
        shift_date=date(2026, 10, 16),
        shift_start="17:15",
        shift_end="22:15",
        break_minutes=30,
        booked_at=datetime(2026, 10, 16, 17, 45),
    )
    assert hours == 4.0
