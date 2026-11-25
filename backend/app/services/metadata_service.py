import re
from pathlib import Path

EDITING_TOOLS = ("photoshop", "gimp", "canva", "illustrator", "inkscape", "affinity", "pixlr", "paint.net")
PDF_DATE_RE = re.compile(r"D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?")


def _indicator(code, label, severity, detail, evidence=None):
    return {
        "code": code,
        "label": label,
        "severity": severity,
        "detail": detail,
        "evidence": evidence or {},
        "source": "metadata",
    }


def _pdf_date(value: str | None) -> str | None:
    if not value:
        return None
    match = PDF_DATE_RE.search(str(value))
    if not match:
        return str(value)
    year, month, day, hour, minute, second = (part or "00" for part in match.groups())
    return f"{year}-{month}-{day}T{hour}:{minute}:{second}"


def _parse_iso(value: str | None):
    if not value:
        return None
    try:
        from datetime import datetime

        return datetime.fromisoformat(value.replace("Z", ""))
    except ValueError:
        return None


def _scan_editing_tool(value: str | None) -> str | None:
    text = (value or "").lower()
    for tool in EDITING_TOOLS:
        if tool in text:
            return tool
    return None


def examine_pdf(path: Path) -> dict:
    import fitz

    indicators = []
    with fitz.open(path) as doc:
        meta = doc.metadata or {}
        page_count = doc.page_count
        is_encrypted = bool(getattr(doc, "is_encrypted", False))
        try:
            pdf_version = doc.pdf_version()
        except Exception:
            pdf_version = None
        sig_flags = 0
        try:
            sig_flags = doc.get_sigflags() or 0
        except Exception:
            pass
        signature_fields = 0
        fonts = []
        images = []
        for page_index in range(min(page_count, 3)):
            page = doc.load_page(page_index)
            for font in page.get_fonts(full=False):
                try:
                    xref, ext, font_type, basefont = font[0], font[1], font[2], font[3]
                except (IndexError, TypeError):
                    continue
                fonts.append({
                    "name": str(basefont or "unknown"),
                    "type": str(font_type or ""),
                    "embedded": str(ext or "").lower() not in ("n/a", ""),
                    "page": page_index + 1,
                })
            page_images = page.get_images(full=True)
            if page_images:
                images.append({"page": page_index + 1, "count": len(page_images)})
            try:
                for widget in page.widgets() or []:
                    if getattr(widget, "field_type", None) == fitz.PDF_WIDGET_TYPE_SIGNATURE:
                        signature_fields += 1
            except Exception:
                pass
        raw_bytes = path.read_bytes()
        eof_count = raw_bytes.count(b"%%EOF")
        incremental_updates = max(0, eof_count - 1)

    creation_raw = meta.get("creationDate")
    modification_raw = meta.get("modDate")
    creation = _pdf_date(creation_raw)
    modification = _pdf_date(modification_raw)
    has_signature = bool(sig_flags & 1) or signature_fields > 0

    producer = meta.get("producer")
    creator = meta.get("creator")
    tool = _scan_editing_tool(producer) or _scan_editing_tool(creator)
    if tool:
        indicators.append(_indicator(
            "meta.editing_software",
            "Metadata names an image/design editing tool",
            "medium",
            f"The PDF producer/creator mentions '{tool}'. Editing tools are legitimate, "
            "but their presence in financial documents warrants a manual review.",
            {"producer": producer, "creator": creator, "tool": tool},
        ))
    if incremental_updates > 0:
        indicators.append(_indicator(
            "meta.incremental_updates",
            "PDF contains incremental update sections",
            "low",
            f"Detected {incremental_updates} incremental save(s). Documents are frequently "
            "re-saved legitimately, so this is an indicator only.",
            {"incremental_updates": incremental_updates},
        ))
    created_dt, modified_dt = _parse_iso(creation), _parse_iso(modification)
    if created_dt and modified_dt and modified_dt > created_dt:
        indicators.append(_indicator(
            "meta.modified_after_creation",
            "Modification timestamp is later than creation timestamp",
            "info",
            "Common for legitimate editing and e-signature workflows; not evidence of forgery.",
            {"creation": creation, "modification": modification},
        ))
    if not has_signature and signature_fields == 0:
        indicators.append(_indicator(
            "meta.no_digital_signature",
            "No digital signature detected",
            "info",
            "The PDF has no detectable digital signature field. Absence of a signature does "
            "not by itself indicate tampering.",
            {},
        ))
    if has_signature:
        indicators.append(_indicator(
            "meta.signature_present",
            "Digital signature field detected",
            "info",
            "A signature field exists. Cryptographic validation of the signer's identity is "
            "outside this baseline analysis unless a trusted validator is configured.",
            {"sig_flags": sig_flags, "signature_fields": signature_fields},
        ))

    metadata = {
        "title": meta.get("title"),
        "author": meta.get("author"),
        "subject": meta.get("subject"),
        "keywords": meta.get("keywords"),
        "creator": creator,
        "producer": producer,
        "creation_date": creation,
        "modification_date": modification,
        "pdf_version": pdf_version,
        "is_encrypted": is_encrypted,
        "has_signature": has_signature,
        "signature_count": max(signature_fields, 1 if (sig_flags & 1) else 0),
        "sig_flags": sig_flags,
        "incremental_updates": incremental_updates,
        "page_count": page_count,
        "fonts": fonts[:60],
        "images": [img for img in images if img.get("count")],
        "raw": {str(k): str(v) for k, v in meta.items()},
    }
    return {"metadata": metadata, "indicators": indicators}


def examine_image(path: Path) -> dict:
    from PIL import Image

    indicators = []
    meta = {}
    try:
        with Image.open(path) as image:
            exif = image.getexif()
            tags = {}
            if exif:
                for tag_id, value in exif.items():
                    name = Image.ExifTags.TAGS.get(tag_id, str(tag_id))
                    if isinstance(value, bytes):
                        value = value.decode("utf-8", errors="replace")[:200]
                    else:
                        value = str(value)[:200]
                    tags[str(name)] = value
        software = tags.get("Software")
        tool = _scan_editing_tool(software)
        if tool:
            indicators.append(_indicator(
                "meta.exif_editing_software",
                "EXIF metadata names an image editing tool",
                "medium",
                f"EXIF Software tag mentions '{tool}'. Many cameras and legitimate apps write "
                "software tags, so treat this as an indicator only.",
                {"software": software},
            ))
        if tags:
            indicators.append(_indicator(
                "meta.exif_present",
                "EXIF metadata present",
                "info",
                "EXIF can be preserved, stripped or rewritten by editing tools; it is not proof of authenticity.",
                {"software": software, "device": tags.get("Model"), "datetime": tags.get("DateTime")},
            ))
        meta = {
            "title": None,
            "author": tags.get("Artist"),
            "subject": None,
            "keywords": None,
            "creator": software,
            "producer": tags.get("Make"),
            "creation_date": tags.get("DateTimeOriginal") or tags.get("DateTime"),
            "modification_date": tags.get("DateTime"),
            "pdf_version": None,
            "is_encrypted": False,
            "has_signature": False,
            "signature_count": 0,
            "sig_flags": 0,
            "incremental_updates": 0,
            "page_count": 1,
            "fonts": [],
            "images": [],
            "raw": tags,
        }
    except Exception:
        meta = {
            "title": None, "author": None, "subject": None, "keywords": None,
            "creator": None, "producer": None, "creation_date": None, "modification_date": None,
            "pdf_version": None, "is_encrypted": False, "has_signature": False,
            "signature_count": 0, "sig_flags": 0, "incremental_updates": 0,
            "page_count": 1, "fonts": [], "images": [], "raw": {},
        }
    return {"metadata": meta, "indicators": indicators}


def examine(path: str | Path, mime_type: str) -> dict:
    path = Path(path)
    if mime_type == "application/pdf":
        return examine_pdf(path)
    return examine_image(path)
