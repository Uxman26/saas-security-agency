from app.services.rota_plan_service import apply_recorded_attendance_overlay


def test_overlay_drops_planner_mark_when_assignment_has_no_attendance():
    payload = {
        "attendance": {
            "12:2026-10-22:0": {"status": "on_time", "hours": "8.00"},
            "12:2026-10-23:0": {"status": "late"},
        }
    }
    slots = {99: "12:2026-10-22:0"}
    out = apply_recorded_attendance_overlay(payload, slots, {})
    att = out.get("attendance") or {}
    assert "12:2026-10-22:0" not in att
    assert att["12:2026-10-23:0"]["status"] == "late"


def test_overlay_recorded_attendance_wins_and_keeps_planner_hours():
    payload = {"attendance": {"12:2026-10-22:0": {"status": "on_time", "hours": "8.00"}}}
    slots = {99: "12:2026-10-22:0"}
    recorded = {"12:2026-10-22:0": {"status": "late", "lateMinutes": 12}}
    out = apply_recorded_attendance_overlay(payload, slots, recorded)
    rec = out["attendance"]["12:2026-10-22:0"]
    assert rec["status"] == "late"
    assert rec["lateMinutes"] == 12
    assert rec["hours"] == "8.00"


def test_overlay_on_time_does_not_keep_stale_late_minutes():
    payload = {"attendance": {"12:2026-10-22:0": {"status": "late", "lateMinutes": 2571}}}
    slots = {99: "12:2026-10-22:0"}
    recorded = {"12:2026-10-22:0": {"status": "on_time", "lateMinutes": 2571}}
    out = apply_recorded_attendance_overlay(payload, slots, recorded)
    rec = out["attendance"]["12:2026-10-22:0"]
    assert rec["status"] == "on_time"
    assert "lateMinutes" not in rec


def test_overlay_empty_slots_leaves_planner_copy():
    payload = {"attendance": {"12:2026-10-22:0": {"status": "on_time"}}}
    out = apply_recorded_attendance_overlay(payload, {}, {})
    assert out["attendance"]["12:2026-10-22:0"]["status"] == "on_time"
