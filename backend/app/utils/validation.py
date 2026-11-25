import re
from datetime import date, datetime

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
ROLE_VALUES = {"admin", "industrial", "public"}
ORG_NAME_MAX = 255


def is_valid_email(email: str) -> bool:
    return bool(email and EMAIL_RE.match(email.strip()))


def password_errors(password: str) -> list[str]:
    errors = []
    if not password or len(password) < 8:
        errors.append("Password must be at least 8 characters long.")
    if not re.search(r"[A-Za-z]", password or ""):
        errors.append("Password must include at least one letter.")
    if not re.search(r"\d", password or ""):
        errors.append("Password must include at least one number.")
    if len(password or "") > 128:
        errors.append("Password must be 128 characters or fewer.")
    return errors


def clean_text(value, max_len: int = 255) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    return text[:max_len] or None


def parse_int(value, default: int | None = None, minimum: int | None = None, maximum: int | None = None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if minimum is not None and parsed < minimum:
        return default
    if maximum is not None and parsed > maximum:
        return default
    return parsed


def parse_float(value, default: float | None = None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_date_value(value) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None
