import io
import os
import shutil
import time
from pathlib import Path

from flask import current_app
from PIL import Image, ImageOps

OCR_DPI_ZOOM = 3.0
OCR_MAX_SIDE = 2600


def _resolve_tesseract_cmd() -> str | None:
    configured = os.environ.get("TESSERACT_CMD")
    if configured and Path(configured).exists():
        return configured
    found = shutil.which("tesseract")
    if found:
        return found
    for candidate in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
    ):
        if Path(candidate).exists():
            return candidate
    return None


def _configure_tesseract() -> bool:
    try:
        import pytesseract

        cmd = _resolve_tesseract_cmd()
        if cmd:
            pytesseract.pytesseract.tesseract_cmd = cmd
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def available_languages() -> list[str]:
    try:
        import pytesseract

        return sorted(pytesseract.get_languages(config=""))
    except Exception:
        return []


def resolve_languages(requested: str | None) -> tuple[str, list[str], str | None]:
    allowed = set(current_app.config["OCR_LANGUAGES"])
    raw = (requested or "eng").replace(" ", "")
    requested_parts = [part for part in raw.split("+") if part in allowed]
    if not requested_parts:
        requested_parts = ["eng"]
    installed = set(available_languages())
    usable = [part for part in requested_parts if part in installed]
    note = None
    if not usable:
        usable = ["eng"] if "eng" in installed else []
        if requested_parts != ["eng"]:
            note = (
                "Requested OCR language data is not installed; fell back to English. "
                "Install additional Tesseract traineddata files to enable Kannada."
            )
    elif len(usable) < len(requested_parts):
        missing = sorted(set(requested_parts) - set(usable))
        note = f"OCR language data not installed for: {', '.join(missing)}. Used {', '.join(usable)}."
    return "+".join(usable) if usable else "eng", requested_parts, note


def _prepare_image(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("L")
    width, height = image.size
    if min(width, height) < 900:
        scale = 900 / max(1, min(width, height))
        image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
    if max(image.size) > OCR_MAX_SIDE:
        ratio = OCR_MAX_SIDE / max(image.size)
        image = image.resize((int(image.width * ratio), int(image.height * ratio)), Image.LANCZOS)
    return ImageOps.autocontrast(image)


def _words_from_tesseract(data: dict, page: int, image_width: int, image_height: int) -> tuple[str, list[dict], float | None]:
    words = []
    lines: dict[tuple, list[str]] = {}
    confidences = []
    count = len(data.get("text", []))
    for i in range(count):
        text = (data["text"][i] or "").strip()
        if not text:
            continue
        width = float(data["width"][i] or 0)
        height = float(data["height"][i] or 0)
        left = float(data["left"][i] or 0)
        top = float(data["top"][i] or 0)
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1.0
        if conf >= 0:
            confidences.append(conf)
        line_key = (data.get("page_num", [1])[i], data.get("block_num", [0])[i],
                    data.get("par_num", [0])[i], data.get("line_num", [0])[i])
        lines.setdefault(line_key, []).append(text)
        words.append({
            "text": text,
            "conf": None if conf < 0 else round(conf / 100.0, 3),
            "x": left / image_width if image_width else 0,
            "y": top / image_height if image_height else 0,
            "w": width / image_width if image_width else 0,
            "h": height / image_height if image_height else 0,
            "page": page,
            "line": f"{page}:{line_key[1]}:{line_key[2]}:{line_key[3]}",
        })
    mean_conf = round(sum(confidences) / len(confidences) / 100.0, 3) if confidences else None
    text = "\n".join(" ".join(parts) for _, parts in sorted(lines.items()))
    return text, words, mean_conf


def _ocr_image(image: Image.Image, lang: str, page: int) -> tuple[str, list[dict], float | None]:
    import pytesseract

    prepared = _prepare_image(image)
    data = pytesseract.image_to_data(
        prepared, lang=lang, config="--oem 3 --psm 3",
        output_type=pytesseract.Output.DICT,
    )
    return _words_from_tesseract(data, page, prepared.width, prepared.height)


def _pdf_page_words(page, page_index: int) -> list[dict]:
    import fitz

    rect = page.rect
    width = max(1.0, rect.width)
    height = max(1.0, rect.height)
    words = []
    for word in page.get_text("words"):
        if len(word) < 5:
            continue
        x0, y0, x1, y1, text = word[0], word[1], word[2], word[3], word[4]
        if not str(text).strip():
            continue
        words.append({
            "text": str(text),
            "conf": None,
            "x": max(0.0, x0 / width),
            "y": max(0.0, y0 / height),
            "w": max(0.0, (x1 - x0) / width),
            "h": max(0.0, (y1 - y0) / height),
            "page": page_index + 1,
            "line": f"{page_index + 1}:{word[5] if len(word) > 5 else 0}:{word[6] if len(word) > 6 else 0}",
        })
    return words


def extract_text(path: str | Path, mime_type: str, requested_language: str = "eng") -> dict:
    started = time.monotonic()
    path = Path(path)
    requested_language = (requested_language or "eng").strip() or "eng"
    language, requested_parts, lang_note = resolve_languages(requested_language)
    if not _configure_tesseract():
        return {
            "engine": "unavailable",
            "language": language,
            "requested_language": "+".join(requested_parts),
            "text": "",
            "words": [],
            "mean_confidence": None,
            "word_count": 0,
            "duration_ms": int((time.monotonic() - started) * 1000),
            "status": "error",
            "note": "Tesseract OCR is not available on this server. Text extraction and "
                    "text-based checks were skipped; visual forensics still ran.",
            "page_count": 0,
        }

    max_pages = current_app.config["ANALYSIS_MAX_PAGES"]
    all_text: list[str] = []
    all_words: list[dict] = []
    confidences: list[float] = []
    notes: list[str] = []
    page_count = 0
    engine = "tesseract"
    try:
        if mime_type == "application/pdf":
            import fitz

            with fitz.open(path) as doc:
                page_count = doc.page_count
                for index in range(min(page_count, max_pages)):
                    page = doc.load_page(index)
                    digital_text = (page.get_text("text") or "").strip()
                    if len(digital_text) >= 40:
                        all_text.append(digital_text.strip())
                        all_words.extend(_pdf_page_words(page, index))
                        notes.append(f"Page {index + 1}: embedded text layer (no OCR needed).")
                    else:
                        pix = page.get_pixmap(matrix=fitz.Matrix(OCR_DPI_ZOOM, OCR_DPI_ZOOM), alpha=False)
                        image = Image.open(io.BytesIO(pix.tobytes("png")))
                        text, words, conf = _ocr_image(image, language, index + 1)
                        all_text.append(text)
                        all_words.extend(words)
                        if conf is not None:
                            confidences.append(conf)
            engine = "pymupdf+tesseract"
        else:
            image = Image.open(path)
            image.load()
            page_count = 1
            text, words, conf = _ocr_image(image, language, 1)
            all_text.append(text)
            all_words.extend(words)
            if conf is not None:
                confidences.append(conf)
    except Exception as exc:  # OCR failure must not crash the whole pipeline
        return {
            "engine": engine,
            "language": language,
            "requested_language": "+".join(requested_parts),
            "text": "\n".join(all_text),
            "words": all_words[: current_app.config["OCR_MAX_WORDS"]],
            "mean_confidence": round(sum(confidences) / len(confidences), 3) if confidences else None,
            "word_count": len(all_words),
            "duration_ms": int((time.monotonic() - started) * 1000),
            "status": "error",
            "note": f"OCR failed: {exc}. Visual forensics still ran.",
            "page_count": page_count,
        }

    text = "\n".join(part for part in all_text if part).strip()
    words = all_words[: current_app.config["OCR_MAX_WORDS"]]
    mean_conf = round(sum(confidences) / len(confidences), 3) if confidences else None
    if page_count > max_pages:
        notes.append(f"Only the first {max_pages} of {page_count} pages were processed.")
    if lang_note:
        notes.append(lang_note)
    status = "ok" if text else "empty"
    if status == "empty":
        notes.append("No readable text was detected. Checks that rely on extracted fields were skipped.")
    return {
        "engine": engine,
        "language": language,
        "requested_language": "+".join(requested_parts),
        "text": text,
        "words": words,
        "mean_confidence": mean_conf,
        "word_count": len(words),
        "duration_ms": int((time.monotonic() - started) * 1000),
        "status": status,
        "note": " ".join(notes) if notes else None,
        "page_count": page_count,
    }
