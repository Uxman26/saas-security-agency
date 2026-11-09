from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.task_service import _apply_status, _overnight


def test_overnight_only_when_end_is_earlier_than_start():
    assert _overnight("20:00", "06:00") is True
    assert _overnight("08:00", "16:00") is False
    assert _overnight("", "06:00") is False


def test_second_completion_keeps_the_original_stamp():
    stamped = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
    row = SimpleNamespace(status="done", completed_at=stamped, completed_by_user_id=4)
    _apply_status(row, "done", SimpleNamespace(id=9))
    assert row.completed_by_user_id == 4
    assert row.completed_at == stamped


def test_reopen_clears_the_stamp():
    row = SimpleNamespace(status="done", completed_at=datetime.now(timezone.utc), completed_by_user_id=4)
    _apply_status(row, "todo", SimpleNamespace(id=9))
    assert row.status == "todo"
    assert row.completed_at is None
    assert row.completed_by_user_id is None
