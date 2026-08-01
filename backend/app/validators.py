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

OptShortTextStr = Optional[ShortTextStr]
OptNoteStr = Optional[NoteStr]

PASSWORD_PATTERN = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{9,}$")
PASSWORD_REQUIREMENTS_MSG = (
    "Password must be at least 9 characters and include uppercase, lowercase, number, and special character"
)


def validate_password_strength(password: str) -> str:
    if not PASSWORD_PATTERN.match(password or ""):
        raise ValueError(PASSWORD_REQUIREMENTS_MSG)
    return password
