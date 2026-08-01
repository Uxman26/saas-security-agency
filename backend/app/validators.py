import re
from typing import Annotated, Optional

from pydantic import StringConstraints

# Mirrors frontend/lib/text-limits.ts — keep the two in step so the UI never lets
# through a value the API will reject.
SITE_NAME_MAX = 40
NAME_MAX = 80
COMPANY_NAME_MAX = 100
TITLE_MAX = 120
EMAIL_MAX = 254
PHONE_MAX = 32
POSTCODE_MAX = 20
ADDRESS_MAX = 200
REFERENCE_MAX = 200
CODE_MAX = 50
NOTE_MAX = 2000
TEXT_MAX = 255
LONG_TEXT_MAX = 5000


def _capped(max_length: int, min_length: int = 0):
    return StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)


# Reusable field types for request schemas. Apply these to *input* models only:
# response models must stay unbounded so rows saved before a limit existed can
# still be read back.
SiteNameStr = Annotated[str, _capped(SITE_NAME_MAX, min_length=2)]
NameStr = Annotated[str, _capped(NAME_MAX, min_length=1)]
CompanyNameStr = Annotated[str, _capped(COMPANY_NAME_MAX, min_length=1)]
TitleStr = Annotated[str, _capped(TITLE_MAX)]
ShortTextStr = Annotated[str, _capped(TEXT_MAX)]
NoteStr = Annotated[str, _capped(NOTE_MAX)]
LongTextStr = Annotated[str, _capped(LONG_TEXT_MAX)]

# The `min_length=1` variants, for fields that are required rather than merely
# present. Because strip_whitespace runs before the length check, these reject a
# whitespace-only value — "   " strips to "" and fails. A plain `str` field accepts it
# and stores a blank that the UI then renders as an unnamed record.
RequiredShortTextStr = Annotated[str, _capped(TEXT_MAX, min_length=1)]
RequiredNoteStr = Annotated[str, _capped(NOTE_MAX, min_length=1)]

OptShortTextStr = Optional[ShortTextStr]
OptNoteStr = Optional[NoteStr]

# Credential fields.
#
# Length caps bound the work an unauthenticated caller can make us do: bcrypt hashes
# the input on every attempt, so an uncapped password field is a cheap CPU-burn vector.
# bcrypt itself only reads the first 72 bytes.
LOGIN_PASSWORD_MAX = 128

# Signed JWTs are the only values submitted here. Generous enough for a JWT with room
# to grow, tight enough that the field is not an unbounded upload.
TOKEN_MAX = 4096

TokenStr = Annotated[str, _capped(TOKEN_MAX, min_length=1)]


def validate_login_password(password: str) -> str:
    """Bound and sanity-check a submitted password without constraining its alphabet.

    Deliberately does NOT reject quotes, semicolons or other SQL meta-characters.
    Every query in this codebase goes through SQLAlchemy with bound parameters, so
    those characters are inert — while banning them from passwords would shrink the
    keyspace and rule out legitimate passphrases. What we do reject is input that
    cannot be anyone's real password: empty, or nothing but whitespace.
    """
    if password is None:
        raise ValueError("Password is required")
    if not password.strip():
        raise ValueError("Password is required")
    if len(password) > LOGIN_PASSWORD_MAX:
        raise ValueError(f"Password must be {LOGIN_PASSWORD_MAX} characters or fewer")
    return password


PASSWORD_PATTERN = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{9,}$")
PASSWORD_REQUIREMENTS_MSG = (
    "Password must be at least 9 characters and include uppercase, lowercase, number, and special character"
)


def validate_password_strength(password: str) -> str:
    if len(password or "") > LOGIN_PASSWORD_MAX:
        raise ValueError(f"Password must be {LOGIN_PASSWORD_MAX} characters or fewer")
    if not PASSWORD_PATTERN.match(password or ""):
        raise ValueError(PASSWORD_REQUIREMENTS_MSG)
    return password
