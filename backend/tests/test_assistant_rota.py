"""Unit tests for AI Rota NL parsing — no DB required for pure helpers."""

from datetime import date

import pytest

from app.services.assistant_rota import (
    _parse_date_phrase,
    _parse_times,
    intervals_overlap,
    looks_like_rota_create,
    looks_like_rota_modify,
    looks_like_rota_recurring,
    resolve_next_weekday,
    unsupported_rota_nl_reply,
)


def test_looks_like_rota_create_phrases():
    assert looks_like_rota_create("Create evening shift for John at Hilton tomorrow 21:00-07:00")
    assert looks_like_rota_create("Book Sarah at North Gate Monday 09:00-17:00")
    assert looks_like_rota_create("Schedule a shift for Alex at Warehouse on Friday 8:00-16:00")
    assert looks_like_rota_create("John at Hilton tomorrow 09:00-17:00")
    assert not looks_like_rota_create("How do I publish a rota?")
    assert not looks_like_rota_create("Summarise attendance exceptions")


def test_parse_times_hhmm_and_ampm():
    assert _parse_times("21:00-07:00") == ("21:00", "07:00")
    assert _parse_times("from 09:00 to 17:00") == ("09:00", "17:00")
    assert _parse_times("9am-5pm") == ("09:00", "17:00")
    assert _parse_times("9:30am to 5:15pm") == ("09:30", "17:15")
    assert _parse_times("9-5") == ("09:00", "17:00")
    assert _parse_times("21-7") == ("21:00", "07:00")
    assert _parse_times("no times here") == (None, None)


def test_parse_times_named_periods():
    assert _parse_times("Create a morning shift for Alex") == ("06:00", "14:00")
    assert _parse_times("afternoon shift at Warehouse") == ("14:00", "22:00")
    assert _parse_times("Schedule an evening shift for Priya") == ("18:00", "02:00")
    assert _parse_times("Book a night shift for Omar") == ("21:00", "07:00")
    # Explicit clocks win over period words
    assert _parse_times("Create a morning shift 08:00-12:00") == ("08:00", "12:00")
    # Do not invent times from a name containing "Morning"
    assert _parse_times("for Morning Star at Hilton") == (None, None)


def test_unsupported_modify_and_recurring():
    assert looks_like_rota_modify("Move Alex's shift tomorrow to 10:00-18:00")
    assert "cannot safely modify" in (unsupported_rota_nl_reply("Move Alex's shift tomorrow") or "").lower()
    assert looks_like_rota_recurring("Create a shift for Alex at North Gate every Monday 09:00-17:00")
    assert "one-off" in (unsupported_rota_nl_reply("every Monday shift") or "").lower()
    assert looks_like_rota_create("Create a morning shift for Alex at North Gate tomorrow")


def test_parse_date_phrase_relative_and_absolute():
    today = date(2026, 11, 9)  # Monday
    assert _parse_date_phrase("today", today) == today
    assert _parse_date_phrase("tomorrow", today) == date(2026, 11, 10)
    assert _parse_date_phrase("Friday", today) == date(2026, 11, 13)
    assert _parse_date_phrase("next Monday", today) == date(2026, 11, 16)
    assert _parse_date_phrase("2026-12-01", today) == date(2026, 12, 1)
    assert _parse_date_phrase("no date", today) is None


def test_resolve_next_weekday_skips_today():
    today = date(2026, 11, 9)  # Monday
    assert resolve_next_weekday("monday", today=today) == date(2026, 11, 16)


def test_overnight_overlap():
    assert intervals_overlap("21:00", "07:00", "22:00", "06:00") is True
    assert intervals_overlap("09:00", "17:00", "18:00", "22:00") is False
    assert intervals_overlap("09:00", "17:00", "16:00", "20:00") is True


def test_missing_date_or_time_does_not_silently_default(monkeypatch):
    """parse_shift_request asks for clarification instead of inventing tomorrow/09-17."""
    from app.services import assistant_rota

    class FakeUser:
        id = 1
        role = "admin"
        company_id = 1

    class FakeCompany:
        id = 1

    class FakeQuery:
        def filter(self, *a, **k):
            return self

        def order_by(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

        def all(self):
            return []

    class FakeDB:
        def query(self, *a, **k):
            return FakeQuery()

    monkeypatch.setattr(assistant_rota, "is_portal_role", lambda u: False)
    monkeypatch.setattr(assistant_rota, "get_company_by_user_id", lambda db, uid: FakeCompany())

    out = assistant_rota.parse_shift_request(FakeDB(), FakeUser(), "Create a shift for John at Hilton")
    assert out["needs_clarification"] is True
    assert out["clarification_type"] == "missing_fields"
    assert "date" in out["message"].lower() or "time" in out["message"].lower()
