"""Successful Clock-In / Clock-Out notifications for Admins / Controllers."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.clock_event_notify_service import (
    KIND_CLOCK_IN,
    KIND_CLOCK_OUT,
    notify_oversight_clock_event,
)


def _assignment(**kwargs):
    base = dict(
        id=42,
        guard_id=7,
        site_id=3,
        date=datetime(2026, 11, 19).date(),
        shift_start="09:00",
        shift_end="17:00",
        guard=SimpleNamespace(id=7, full_name="Alex Smith", name="Alex Smith"),
        site=SimpleNamespace(id=3, name="Gate A"),
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def _company():
    return SimpleNamespace(id=1, admin_id=99, timezone="Europe/London")


def test_kind_constants():
    assert KIND_CLOCK_IN == "clock_in"
    assert KIND_CLOCK_OUT == "clock_out"


@patch("app.services.clock_event_notify_service._oversight_user_ids", return_value=[10, 11, 12])
@patch("app.services.fcm_push_service.notify_after_app_notification")
def test_notifies_oversight_and_skips_actor(mock_fcm, _mock_ids):
    db = MagicMock()
    # No prior notification (dedupe miss)
    db.query.return_value.filter.return_value.first.return_value = None

    sent = notify_oversight_clock_event(
        db,
        company=_company(),
        assignment=_assignment(),
        book_off=False,
        event_at_utc=datetime(2026, 11, 19, 9, 2, tzinfo=timezone.utc),
        actor_user_id=11,
        late=True,
    )

    assert sent == 2  # 10 and 12; actor 11 excluded
    assert db.add.call_count == 2
    assert mock_fcm.call_count == 2
    first_row = db.add.call_args_list[0].args[0]
    assert first_row.kind == KIND_CLOCK_IN
    assert first_row.entity_type == "assignment"
    assert first_row.entity_id == 42
    assert "Alex Smith" in first_row.body
    assert "Gate A" in first_row.body
    assert "09:00–17:00" in first_row.body
    assert "(late)" in first_row.body
    assert first_row.title == "Staff Clocked In"


@patch("app.services.clock_event_notify_service._oversight_user_ids", return_value=[10])
@patch("app.services.fcm_push_service.notify_after_app_notification")
def test_clock_out_kind_and_dedupe_skips_repeat(mock_fcm, _mock_ids):
    db = MagicMock()
    # Existing notification → dedupe
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id=1)

    sent = notify_oversight_clock_event(
        db,
        company=_company(),
        assignment=_assignment(),
        book_off=True,
        event_at_utc=datetime(2026, 11, 19, 17, 5, tzinfo=timezone.utc),
        actor_user_id=99,
        overtime=True,
    )

    assert sent == 0
    db.add.assert_not_called()
    mock_fcm.assert_not_called()


@patch("app.services.clock_event_notify_service._oversight_user_ids", return_value=[10])
@patch("app.services.fcm_push_service.notify_after_app_notification")
def test_clock_out_body_includes_time_and_shift(mock_fcm, _mock_ids):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.side_effect = [
        None,  # dedupe check
        SimpleNamespace(id=10, notification_sound_muted=False),  # user for mute
    ]

    sent = notify_oversight_clock_event(
        db,
        company=_company(),
        assignment=_assignment(),
        book_off=True,
        event_at_utc=datetime(2026, 11, 19, 17, 5, tzinfo=timezone.utc),
        early_finish=True,
    )

    assert sent == 1
    row = db.add.call_args.args[0]
    assert row.kind == KIND_CLOCK_OUT
    assert row.title == "Staff Clocked Out"
    assert "early finish" in row.body
    assert "Alex Smith" in row.body
    assert mock_fcm.called
    kwargs = mock_fcm.call_args.kwargs
    assert kwargs["kind"] == KIND_CLOCK_OUT
    assert kwargs["tag"] == "clock_out-42"
    assert kwargs["data"]["clock_event"] == "clock_out"
