"""Rota change notifications for Controllers / Tenant Admins."""

from app.services.rota_notify_service import ShiftChange, _oversight_change_summary


def test_oversight_change_summary_counts_kinds():
    changes = [
        ShiftChange(guard_id=1, kind="removed", date="2026-11-10", detail="cancelled"),
        ShiftChange(guard_id=2, kind="removed", date="2026-11-10", detail="cancelled"),
        ShiftChange(guard_id=3, kind="added", date="2026-11-11", detail="added"),
        ShiftChange(guard_id=4, kind="time_changed", date="2026-11-12", detail="time"),
    ]
    title, body = _oversight_change_summary("Week 46", changes)
    assert title == "Rota update — Week 46"
    assert "2 cancelled" in body
    assert "1 added" in body
    assert "1 time changed" in body
