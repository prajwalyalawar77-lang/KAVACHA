import hashlib
import os
import re
import secrets
from pathlib import Path

from flask import current_app

from app.utils.time import utcnow

MAGIC_SIGNATURES = (
    (b"%PDF-", "application/pdf", "pdf"),
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
)

MAX_IMAGE_PIXELS = 40_000_000


def sniff_file_type(head: bytes) -> tuple[str, str] | None:
    for signature, mime, ext in MAGIC_SIGNATURES:
        if head.startswith(signature):
            return mime, ext
    return None


def normalize_extension(ext: str) -> str:
    return ext.lower().lstrip(".")


def is_allowed_extension(filename: str) -> bool:
    ext = normalize_extension(Path(filename or "").suffix)
    return ext in current_app.config["ALLOWED_EXTENSIONS"]


def sanitize_display_filename(filename: str) -> str:
    base = os.path.basename(str(filename or "document"))
    base = re.sub(r"[^\w\s.\-()]", "_", base, flags=re.UNICODE)
    base = re.sub(r"\s+", " ", base).strip(" .")
    return (base or "document")[:200]


def sha256_file(path: str | Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_stored_path(extension: str) -> tuple[str, Path]:
    """Return a random relative path (inside storage) and the absolute path."""
    stamp = utcnow().strftime("%Y/%m")
    relative = Path("uploads") / stamp / f"{secrets.token_hex(16)}.{extension}"
    absolute = current_app.config["STORAGE_ROOT"] / relative
    absolute.parent.mkdir(parents=True, exist_ok=True)
    return relative.as_posix(), absolute


def resolve_storage_path(relative_path: str | None) -> Path | None:
    if not relative_path:
        return None
    root = Path(current_app.config["STORAGE_ROOT"]).resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError("Resolved path escapes the storage root") from exc
    return candidate


def delete_storage_file(relative_path: str | None) -> bool:
    try:
        path = resolve_storage_path(relative_path)
    except ValueError:
        return False
    if not path or not path.exists():
        return False
    try:
        path.unlink()
        return True
    except OSError:
        return False


def dhash(image, hash_size: int = 8) -> str:
    gray = image.convert("L").resize((hash_size + 1, hash_size))
    pixels = list(gray.getdata())
    bits = 0
    index = 0
    for row in range(hash_size):
        for col in range(hash_size):
            left = pixels[row * (hash_size + 1) + col]
            right = pixels[row * (hash_size + 1) + col + 1]
            if left > right:
                bits |= 1 << index
            index += 1
    return f"{bits:016x}"


def ahash(image, hash_size: int = 8) -> str:
    gray = image.convert("L").resize((hash_size, hash_size))
    pixels = list(gray.getdata())
    average = sum(pixels) / len(pixels)
    bits = 0
    for index, value in enumerate(pixels):
        if value > average:
            bits |= 1 << index
    return f"{bits:016x}"


def hamming(hash_a: str | None, hash_b: str | None) -> int:
    if not hash_a or not hash_b:
        return 64
    try:
        return bin(int(hash_a, 16) ^ int(hash_b, 16)).count("1")
    except ValueError:
        return 64
