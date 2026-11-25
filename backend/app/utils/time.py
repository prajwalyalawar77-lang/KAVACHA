from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite stores naive datetimes consistently)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.replace(tzinfo=None).isoformat() + "Z"
    return dt.isoformat()


def days_between(later, earlier) -> int | None:
    if not later or not earlier:
        return None
    return (later - earlier).days


def parse_date(value):
    """Parse common invoice date formats. Returns (date|None, error|None)."""
    if not value:
        return None, "no date provided"
    if hasattr(value, "year"):
        return value, None
    text = str(value).strip()
    for fmt in (
        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%Y/%m/%d",
        "%d/%m/%y", "%d-%m-%y", "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y",
        "%m/%d/%Y",
    ):
        try:
            return datetime.strptime(text, fmt).date(), None
        except ValueError:
            continue
    return None, f"unrecognised date format: {text[:32]}"
