import json
from datetime import date

from app.services.rota_plan_service import _remap_payload


def test_remap_payload_shifts_and_attendance():
    payload = {
        "rotaView": "table",
        "days": ["2026-06-09", "2026-06-10", "2026-06-11"],
        "employees": [{"id": "1", "name": "Alex", "role": "Staff", "avatarColor": "#3b82f6"}],
        "shifts": {
            "1": {
                "2026-06-09": [{"start": "09:00", "end": "17:00", "site": "Hotel", "notes": "temp", "breakH": 0, "breakM": 30, "color": "#3b82f6", "label": ""}],
                "2026-06-11": [{"start": "10:00", "end": "18:00", "site": "", "notes": "one-off", "breakH": 0, "breakM": 0, "color": "#10b981", "label": ""}],
            }
        },
        "attendance": {
            "1:2026-06-09:0": {"status": "present", "hours": "7.50", "note": "", "empId": "1", "dk": "2026-06-09", "si": 0}
        },
        "budget": 100,
        "inclBreaks": False,
    }
    out = _remap_payload(payload, date(2026, 6, 9), 3, date(2026, 7, 1), 3)
    assert out["days"] == ["2026-07-01", "2026-07-02", "2026-07-03"]
    assert out["shifts"]["1"]["2026-07-01"][0]["notes"] == "temp"
    assert out["shifts"]["1"]["2026-07-03"][0]["notes"] == "one-off"
    assert "1:2026-07-01:0" in out["attendance"]
    assert out["attendance"]["1:2026-07-01:0"]["dk"] == "2026-07-01"


def test_remap_payload_truncates_extra_days():
    payload = {
        "days": ["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"],
        "shifts": {"2": {"2026-06-12": [{"start": "09:00", "end": "17:00", "site": "X", "notes": "", "breakH": 0, "breakM": 0, "color": "#3b82f6", "label": ""}]}},
        "employees": [],
        "attendance": {},
        "budget": 0,
        "inclBreaks": False,
        "rotaView": "table",
    }
    out = _remap_payload(payload, date(2026, 6, 9), 4, date(2026, 8, 1), 2)
    assert out["days"] == ["2026-08-01", "2026-08-02"]
    assert "2" not in out["shifts"]
