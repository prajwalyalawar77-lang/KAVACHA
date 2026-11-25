"""Format and checksum validators. These validate structure only unless an
authorised external API is explicitly configured — they never claim that a
registration exists or that a bank account belongs to a supplier.
"""

import re

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
ACCOUNT_RE = re.compile(r"^[0-9]{9,18}$")
INVOICE_NO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\/\-_. ]{1,29}$")
GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GST_STATE_CODES = {f"{n:02d}" for n in range(1, 39)} | {"97", "99"}
KNOWN_IFSC_PREFIXES = {
    "HDFC", "ICIC", "SBIN", "UTIB", "KKBK", "PUNB", "BARB", "CNRB", "IDIB",
    "IOBA", "YESB", "IDFB", "FDRL", "UBIN", "ANDB", "BKID", "CBIN", "CSBK",
    "DCBL", "ESFB", "FGBL", "IBKL", "INDB", "JAKA", "KVBL", "LAVB", "MAHB",
    "NKGS", "ORBC", "PSIB", "RATN", "SIBL", "SYNB", "TMBL", "UCBA", "VYSA",
    "WBSC", "AUBL", "BDBL", "CIUB", "CNRB", "COSB", "DHBK", "DLXB", "GSCB",
}
ALLOWED_GST_RATES = {0.0, 0.25, 3.0, 5.0, 12.0, 18.0, 28.0}

_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def gstin_checksum_char(first14: str) -> str | None:
    if len(first14) != 14 or any(ch not in GSTIN_CHARS for ch in first14):
        return None
    factor = 1
    total = 0
    for ch in first14:
        code = GSTIN_CHARS.index(ch)
        addend = factor * code
        factor = 1 if factor == 2 else 2
        total += addend // 36 + addend % 36
    return GSTIN_CHARS[(36 - total % 36) % 36]


def validate_gstin(value: str | None) -> dict:
    result = {"value": (value or "").strip().upper(), "valid": False, "errors": [], "checks": {}}
    gstin = result["value"]
    if not gstin:
        result["errors"].append("GSTIN not found.")
        return result
    if not GSTIN_RE.match(gstin):
        result["errors"].append(
            "GSTIN must be 15 characters: 2-digit state code, 10-character PAN, "
            "entity number, the letter Z and a checksum character."
        )
        return result
    state = gstin[:2]
    result["checks"]["state_code"] = state
    if state not in GST_STATE_CODES:
        result["errors"].append(f"State code '{state}' is not a recognised GST state code.")
    pan = gstin[2:12]
    result["checks"]["pan"] = pan
    if not PAN_RE.match(pan):
        result["errors"].append("The embedded PAN block is not in a valid PAN format.")
    if gstin[13] != "Z":
        result["errors"].append("The 14th character of a GSTIN must be 'Z'.")
    expected = gstin_checksum_char(gstin[:14])
    result["checks"]["checksum_expected"] = expected
    result["checks"]["checksum_actual"] = gstin[14]
    if expected and expected != gstin[14]:
        result["errors"].append(
            f"Checksum character is invalid (expected '{expected}', found '{gstin[14]}'). "
            "OCR misreading is also possible — confirm against the source document."
        )
    result["valid"] = not result["errors"]
    result["note"] = (
        "Checksum validation confirms structural integrity only. It does not prove "
        "that the GSTIN is active or registered to this business."
    )
    return result


def validate_pan(value: str | None) -> dict:
    pan = (value or "").strip().upper()
    valid = bool(PAN_RE.match(pan))
    return {
        "value": pan,
        "valid": valid,
        "note": "PAN format validation only; no income-tax database lookup was performed.",
        "errors": [] if valid else ["PAN must match AAAAA9999A format."],
    }


def validate_ifsc(value: str | None) -> dict:
    ifsc = (value or "").strip().upper()
    valid = bool(IFSC_RE.match(ifsc))
    prefix_known = ifsc[:4] in KNOWN_IFSC_PREFIXES if len(ifsc) >= 4 else False
    return {
        "value": ifsc,
        "valid": valid,
        "prefix_known": prefix_known,
        "errors": [] if valid else ["IFSC must be 4 letters, 0, then 6 alphanumeric characters."],
        "note": "Format validation only. Bank/branch existence requires an authorised API.",
    }


def validate_bank_account(value: str | None) -> dict:
    account = re.sub(r"\s+", "", (value or ""))
    valid = bool(ACCOUNT_RE.match(account))
    return {
        "value": account,
        "valid": valid,
        "errors": [] if valid else ["Bank account number should contain 9–18 digits."],
        "note": "Format validation only; account ownership is not verified.",
    }


def validate_invoice_number(value: str | None) -> dict:
    number = (value or "").strip()
    valid = bool(INVOICE_NO_RE.match(number))
    return {
        "value": number,
        "valid": valid,
        "errors": [] if valid else ["Invoice number is missing or contains unsupported characters."],
    }


def verhoeff_valid(number: str) -> bool:
    digits = re.sub(r"\D", "", str(number or ""))
    if not digits:
        return False
    checksum = 0
    for index, char in enumerate(reversed(digits)):
        checksum = _VERHOEFF_D[checksum][_VERHOEFF_P[index % 8][int(char)]]
    return checksum == 0


def luhn_valid(number: str) -> bool:
    digits = [int(ch) for ch in re.sub(r"\D", "", str(number or ""))]
    if len(digits) < 12:
        return False
    total = 0
    parity = len(digits) % 2
    for index, digit in enumerate(digits):
        if index % 2 == parity:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def tax_rate_allowed(rate: float | None) -> bool:
    if rate is None:
        return True
    return any(abs(rate - allowed) < 0.001 for allowed in ALLOWED_GST_RATES)
