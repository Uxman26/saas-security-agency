from datetime import date, datetime, timezone

from app.schemas import RotaPlanListItem
from app.services.rota_plan_service import (
    _compact_list_item,
    _count_shifts_from_json,
    _count_staff_from_json,
    _site_names_from_json,
    _staff_ids_with_shifts_from_json,
    _to_list_items,
)


class _Plan:
    def __init__(self, **kw):
        self.id = kw.get("id", 1)
        self.company_id = kw.get("company_id", 10)
        self.name = kw.get("name", "Week")
        self.start_date = kw.get("start_date", date(2026, 10, 20))
        self.end_date = kw.get("end_date", date(2026, 10, 27))
        self.day_count = kw.get("day_count", 8)
        self.view_mode = kw.get("view_mode", "table")
        self.budget = kw.get("budget", 0)
        self.status = kw.get("status", "draft")
        self.planner_data = kw.get("planner_data")
        self.created_at = kw.get("created_at", datetime(2026, 10, 1, tzinfo=timezone.utc))
        self.updated_at = kw.get("updated_at")
        self.published_at = kw.get("published_at")


PLANNER = """{"days":["2026-10-20"],"employees":[{"id":"1"},{"id":"2"}],"shifts":{"1":{"2026-10-20":[{"site":"Hive"}]},"2":{"2026-10-20":[]}}}"""


def test_compact_list_item_skips_counts():
    item = _compact_list_item(_Plan(status="published", budget=12.5))
    assert isinstance(item, RotaPlanListItem)
    assert item.shift_count == 0
    assert item.staff_count == 0
    assert item.site_names == []
    assert item.budget == 12.5
    assert item.status == "published"


def test_json_shift_counts_ignore_empty_days():
    assert _count_shifts_from_json(PLANNER) == 1
    assert _count_staff_from_json(PLANNER) == 2
    assert _staff_ids_with_shifts_from_json(PLANNER) == {1}
    assert _site_names_from_json(PLANNER) == ["Hive"]


def test_unpublished_uses_planner_minus_published():
    with_shifts = _staff_ids_with_shifts_from_json(PLANNER)
    assert len(with_shifts - {1}) == 0
    assert len(with_shifts - set()) == 1


def test_to_list_items_empty():
    assert _to_list_items(None, []) == []
