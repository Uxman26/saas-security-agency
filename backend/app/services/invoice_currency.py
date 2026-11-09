from __future__ import annotations

from fastapi import HTTPException

INVOICE_CURRENCIES = {
    "GBP": "£",
    "USD": "$",
    "EUR": "€",
    "CAD": "CA$",
    "AUD": "A$",
    "NZD": "NZ$",
    "CHF": "CHF ",
    "JPY": "¥",
    "INR": "₹",
    "PKR": "Rs ",
    "AED": "AED ",
    "SAR": "SAR ",
    "ZAR": "R",
    "NGN": "₦",
    "SGD": "S$",
    "HKD": "HK$",
    "SEK": "kr ",
    "NOK": "kr ",
    "DKK": "kr ",
    "PLN": "zł ",
    "TRY": "₺",
}


def normalize_invoice_currency(code: str | None) -> str:
    raw = (code or "GBP").strip().upper()
    if raw not in INVOICE_CURRENCIES:
        raise HTTPException(status_code=422, detail="Unsupported currency")
    return raw
