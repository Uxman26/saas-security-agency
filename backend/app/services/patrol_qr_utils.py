from urllib.parse import unquote

MAX_GPS_ACCURACY_M = 7.0

# Only these PatrolLog / occurrence statuses count as a completed checkpoint.
SUCCESS_SCAN_STATUSES = frozenset({"completed", "completed_late"})

# Logged attempts that must never close a scheduled occurrence.
NON_COMPLETING_SCAN_STATUSES = frozenset(
    {
        "failed_gps",
        "duplicate",
        "out_of_window",
        "no_scheduled_slot",
        "rejected",
    }
)


def scan_may_complete_occurrence(status: str) -> bool:
    return (status or "").strip().lower() in SUCCESS_SCAN_STATUSES


def normalize_qr_token(raw: str) -> str:
    """Accept bare tokens or printed sticker URLs ending in /patrol/check/{token}."""
    s = (raw or "").strip()
    if not s:
        return s
    lower = s.lower()
    marker = "/patrol/check/"
    idx = lower.rfind(marker)
    if idx >= 0:
        part = s[idx + len(marker) :]
        part = part.split("?", 1)[0].split("#", 1)[0].strip("/")
        return unquote(part).strip()
    return s
