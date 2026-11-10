"""Hours agreed when a shift finishes early.

The figures live on the shift's early-finish adjustment in the rota planner: Payable Hours
go to payroll and Chargeable Hours go to the client invoice, independently of each other
and of the time the shift actually ended.
"""
from typing import Any, Optional

# An outcome that says the shift was not worked outranks an early finish logged on it.
_NOT_WORKED = frozenset({"absent", "no_show", "cancelled", "cancelled_unpaid", "cancelled_paid"})


def agreed_hours_apply(status: Optional[str]) -> bool:
    """Whether agreed early-finish hours count for a shift with this attendance status."""
    return str(status or "").strip().lower().replace(" ", "_") not in _NOT_WORKED


def _hours(raw: Any) -> Optional[float]:
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    try:
        return round(max(0.0, float(raw)), 2)
    except (TypeError, ValueError):
        return None


def agreed_early_finish_hours(shift: dict) -> tuple[Optional[float], Optional[float]]:
    """(payable, chargeable) from the shift's latest early finish, None where not entered."""
    latest = None
    for adj in shift.get("adjustments") or []:
        if isinstance(adj, dict) and adj.get("type") == "early_finish":
            latest = adj
    if latest is None:
        return None, None
    return _hours(latest.get("payableHours")), _hours(latest.get("chargeableHours"))
