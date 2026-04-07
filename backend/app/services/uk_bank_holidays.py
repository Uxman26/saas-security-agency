from typing import List, Tuple
from datetime import date

_UK_ENG_WALES: dict[int, List[Tuple[str, str]]] = {
    2025: [
        ("2025-01-01", "New Year's Day"),
        ("2025-04-18", "Good Friday"),
        ("2025-04-21", "Easter Monday"),
        ("2025-05-05", "Early May bank holiday"),
        ("2025-05-26", "Spring bank holiday"),
        ("2025-08-25", "Summer bank holiday"),
        ("2025-12-25", "Christmas Day"),
        ("2025-12-26", "Boxing Day"),
    ],
    2026: [
        ("2026-01-01", "New Year's Day"),
        ("2026-04-03", "Good Friday"),
        ("2026-04-06", "Easter Monday"),
        ("2026-05-04", "Early May bank holiday"),
        ("2026-05-25", "Spring bank holiday"),
        ("2026-08-31", "Summer bank holiday"),
        ("2026-12-25", "Christmas Day"),
        ("2026-12-26", "Boxing Day"),
    ],
    2027: [
        ("2027-01-01", "New Year's Day"),
        ("2027-03-26", "Good Friday"),
        ("2027-03-29", "Easter Monday"),
        ("2027-05-03", "Early May bank holiday"),
        ("2027-05-31", "Spring bank holiday"),
        ("2027-08-30", "Summer bank holiday"),
        ("2027-12-27", "Christmas Day (substitute)"),
        ("2027-12-28", "Boxing Day (substitute)"),
    ],
    2028: [
        ("2028-01-03", "New Year's Day (substitute)"),
        ("2028-04-14", "Good Friday"),
        ("2028-04-17", "Easter Monday"),
        ("2028-05-01", "Early May bank holiday"),
        ("2028-05-29", "Spring bank holiday"),
        ("2028-08-28", "Summer bank holiday"),
        ("2028-12-25", "Christmas Day"),
        ("2028-12-26", "Boxing Day"),
    ],
}


def uk_england_wales_entries(year: int) -> List[Tuple[date, str]]:
    rows = _UK_ENG_WALES.get(year)
    if not rows:
        return []
    out: List[Tuple[date, str]] = []
    for ds, lab in rows:
        y, m, d = map(int, ds.split("-"))
        out.append((date(y, m, d), lab))
    return out
