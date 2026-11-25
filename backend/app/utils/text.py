import json
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal
from difflib import SequenceMatcher

COMPANY_SUFFIXES = {
    "pvt", "private", "ltd", "limited", "llp", "inc", "incorporated", "corp", "corporation",
    "co", "company", "enterprises", "enterprise", "traders", "trading", "industries",
    "industry", "solutions", "services", "and", "&", "the",
}


def parse_amount(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value)
    text = text.replace("\u20b9", " ").replace("INR", " ").replace("Rs.", " ").replace("Rs", " ")
    text = text.replace("/-", "").replace(" ", "")
    matches = re.findall(r"-?\d[\d,]*(?:\.\d{1,4})?", text)
    if not matches:
        return None
    try:
        return float(matches[0].replace(",", ""))
    except ValueError:
        return None


def normalize_invoice_number(value: str | None) -> str | None:
    if not value:
        return None
    return re.sub(r"[^A-Z0-9]", "", str(value).upper()) or None


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKC", str(value)).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = [t for t in text.split() if t and t not in COMPANY_SUFFIXES]
    return " ".join(tokens)


def name_similarity(left: str | None, right: str | None) -> float:
    a, b = normalize_name(left), normalize_name(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return round(SequenceMatcher(None, a, b).ratio(), 4)


def text_similarity(left: str | None, right: str | None) -> float:
    a = re.sub(r"\s+", " ", (left or "").strip().lower())
    b = re.sub(r"\s+", " ", (right or "").strip().lower())
    if not a or not b:
        return 0.0
    return round(SequenceMatcher(None, a, b).ratio(), 4)


def truncate(value: str | None, length: int = 500) -> str | None:
    if value is None:
        return None
    return value if len(value) <= length else value[: length - 1] + "…"


def json_safe(value):
    """Make numpy / Decimal / date values JSON serialisable."""
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return item()
        except (TypeError, ValueError):
            pass
    return str(value)


def dumps(value) -> str:
    return json.dumps(json_safe(value), ensure_ascii=False)


def mask_value(value: str | None, visible: int = 4) -> str:
    if not value:
        return ""
    text = str(value)
    if len(text) <= visible:
        return "*" * len(text)
    return "*" * (len(text) - visible) + text[-visible:]
