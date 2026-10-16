from app.services.patrol_qr_utils import (
    NON_COMPLETING_SCAN_STATUSES,
    SUCCESS_SCAN_STATUSES,
    scan_may_complete_occurrence,
)


def test_only_completed_statuses_close_occurrence():
    assert scan_may_complete_occurrence("completed") is True
    assert scan_may_complete_occurrence("completed_late") is True
    for s in NON_COMPLETING_SCAN_STATUSES:
        assert scan_may_complete_occurrence(s) is False
    assert scan_may_complete_occurrence("failed_gps") is False
    assert scan_may_complete_occurrence("duplicate") is False
    assert scan_may_complete_occurrence("out_of_window") is False
    assert scan_may_complete_occurrence("no_scheduled_slot") is False


def test_success_and_non_completing_disjoint():
    assert SUCCESS_SCAN_STATUSES.isdisjoint(NON_COMPLETING_SCAN_STATUSES)
