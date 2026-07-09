import re

PASSWORD_PATTERN = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{9,}$")
PASSWORD_REQUIREMENTS_MSG = (
    "Password must be at least 9 characters and include uppercase, lowercase, number, and special character"
)


def validate_password_strength(password: str) -> str:
    if not PASSWORD_PATTERN.match(password or ""):
        raise ValueError(PASSWORD_REQUIREMENTS_MSG)
    return password
