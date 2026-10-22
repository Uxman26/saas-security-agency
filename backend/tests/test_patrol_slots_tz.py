from datetime import date
from zoneinfo import ZoneInfo

from app.services.patrol_schedule_service import slot_datetimes_for_day


def test_london_bst_slots_are_stored_as_utc():
    slots = slot_datetimes_for_day(
        date(2026, 7, 15),
        "14:00",
        "14:00",
        60,
        zone=ZoneInfo("Europe/London"),
    )
    assert len(slots) == 1
    assert slots[0].hour == 13
    assert slots[0].tzinfo is not None
    assert slots[0].utcoffset().total_seconds() == 0


def test_london_gmt_slots_match_utc():
    slots = slot_datetimes_for_day(
        date(2026, 1, 15),
        "14:00",
        "14:00",
        60,
        zone=ZoneInfo("Europe/London"),
    )
    assert len(slots) == 1
    assert slots[0].hour == 14
