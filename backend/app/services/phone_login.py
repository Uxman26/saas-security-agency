"""Logins that sign in with a mobile number instead of an email address.

A login still needs a unique email on the users table, so a phone login is stored under
an address made from its number: ``447700900123@phone-login.controlops.co.uk``. Typing
the number at sign-in builds the same address and the normal email login does the rest
(company ID, password, lockout, MFA). Nothing is ever emailed to these addresses.
"""
from __future__ import annotations

import re
from typing import Optional

PHONE_LOGIN_DOMAIN = "phone-login.controlops.co.uk"


def normalize_login_phone(raw: Optional[str]) -> Optional[str]:
    """The number as international digits ("447700900123"), or None if it is not one.

    UK style is assumed for a leading 0: 07700 900123, +44 7700 900123, 0044… and
    447700900123 are all the same number.
    """
    s = (raw or "").strip()
    if not s or "@" in s:
        return None
    if re.search(r"[^\d\s()+.\-]", s):
        return None
    digits = re.sub(r"\D", "", s)
    if s.startswith("+"):
        pass
    elif digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = "44" + digits[1:]
    if digits.startswith("440"):
        # "+44 (0) 7700…" written with the trunk zero kept.
        digits = "44" + digits[3:]
    if not 9 <= len(digits) <= 15:
        return None
    return digits


def phone_login_email(digits: str) -> str:
    return f"{digits}@{PHONE_LOGIN_DOMAIN}"


def is_phone_login_email(email: Optional[str]) -> bool:
    return (email or "").strip().lower().endswith("@" + PHONE_LOGIN_DOMAIN)


def phone_from_login_email(email: Optional[str]) -> Optional[str]:
    """"+447700900123" for a phone login's stored address, None for a real email."""
    if not is_phone_login_email(email):
        return None
    return "+" + (email or "").split("@", 1)[0]


def login_email_for(identifier: str) -> Optional[str]:
    """What a sign-in box value logs in as: an email as typed, or a number's address."""
    value = (identifier or "").strip()
    if "@" in value:
        return value.lower()
    digits = normalize_login_phone(value)
    return phone_login_email(digits) if digits else None
