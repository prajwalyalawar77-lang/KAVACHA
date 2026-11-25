import io
import os
from pathlib import Path

from flask import current_app
from PIL import Image, ImageOps

from app.utils.files import (
    ahash,
    build_stored_path,
    dhash,
    delete_storage_file,
    is_allowed_extension,
    normalize_extension,
    resolve_storage_path,
    sanitize_display_filename,
    sha256_file,
    sniff_file_type,
)

Image.MAX_IMAGE_PIXELS = 40_000_000


class UploadError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "invalid_upload"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _validate_image(path: Path) -> dict:
    try:
        with Image.open(path) as probe:
            probe.verify()
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            image.load()
            width, height = image.size
            if width < 40 or height < 40:
                raise UploadError("Image is too small to analyse (minimum 40×40 pixels).")
            if width * height > Image.MAX_IMAGE_PIXELS:
                raise UploadError("Image dimensions are too large to process safely.")
            return {
                "width": width,
                "height": height,
                "page_count": 1,
                "dhash": dhash(image),
                "ahash": ahash(image),
            }
    except UploadError:
        raise
    except Exception as exc:  # corrupted / malformed image
        raise UploadError("The image could not be opened or is corrupted.") from exc


def _validate_pdf(path: Path) -> dict:
    try:
        import fitz  # PyMuPDF

        with fitz.open(path) as doc:
            if doc.needs_pass:
                raise UploadError("Password-protected PDFs are not supported.")
            page_count = doc.page_count
            if page_count < 1:
                raise UploadError("The PDF contains no pages.")
            width = height = None
            dhash_value = ahash_value = None
            try:
                page = doc.load_page(0)
                rect = page.rect
                width, height = int(rect.width), int(rect.height)
                pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5), alpha=False)
                image = Image.open(io.BytesIO(pix.tobytes("png")))
                dhash_value = dhash(image)
                ahash_value = ahash(image)
            except Exception:
                pass
            return {
                "width": width,
                "height": height,
                "page_count": page_count,
                "dhash": dhash_value,
                "ahash": ahash_value,
            }
    except UploadError:
        raise
    except Exception as exc:
        raise UploadError("The PDF file is corrupted or unreadable.") from exc


def save_upload(file_storage) -> dict:
    """Validate an upload using extension + magic bytes + parser checks, then store securely."""
    if file_storage is None or not file_storage.filename:
        raise UploadError("No file was provided.")
    filename = sanitize_display_filename(file_storage.filename)
    if not is_allowed_extension(filename):
        raise UploadError("Unsupported file type. Upload a PDF, JPG, JPEG or PNG file.")
    extension = normalize_extension(Path(filename).suffix)

    head = file_storage.stream.read(16)
    file_storage.stream.seek(0)
    detected = sniff_file_type(head)
    if not detected:
        raise UploadError("File signature does not match a supported PDF or image format.")
    detected_mime, detected_ext = detected
    if extension in ("jpg", "jpeg"):
        extension = "jpg"
    if detected_ext != extension:
        raise UploadError(
            f"File extension .{extension} does not match the detected {detected_mime} content."
        )

    relative, absolute = build_stored_path(extension)
    bytes_written = 0
    max_bytes = current_app.config["MAX_CONTENT_LENGTH"]
    try:
        with open(absolute, "wb") as target:
            while True:
                chunk = file_storage.stream.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    raise UploadError(
                        f"File exceeds the {current_app.config['MAX_UPLOAD_MB']} MB upload limit.",
                        413,
                        "file_too_large",
                    )
                target.write(chunk)
        if bytes_written < 20:
            raise UploadError("The uploaded file is empty or incomplete.")
        with open(absolute, "rb") as handle:
            if not sniff_file_type(handle.read(16)):
                raise UploadError("Stored file failed signature re-validation.")
        if detected_mime == "application/pdf":
            probe = _validate_pdf(absolute)
        else:
            probe = _validate_image(absolute)
        sha256 = sha256_file(absolute)
        return {
            "original_filename": filename,
            "stored_path": relative,
            "mime_type": detected_mime,
            "file_size": bytes_written,
            "sha256": sha256,
            **probe,
        }
    except UploadError:
        delete_storage_file(relative)
        raise
    except Exception as exc:
        delete_storage_file(relative)
        raise UploadError("The file could not be stored securely. Please try again.") from exc


def document_absolute_path(document) -> Path:
    path = resolve_storage_path(document.stored_path)
    if not path or not path.exists():
        raise FileNotFoundError("The stored document file is missing.")
    return path


def save_pil_artifact(document_uuid: str, name: str, image: Image.Image) -> str:
    folder = current_app.config["ARTIFACT_FOLDER"] / document_uuid
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{name}.png"
    image.convert("RGB").save(target, format="PNG", optimize=True)
    return (Path("artifacts") / document_uuid / f"{name}.png").as_posix()


def artifact_path(document_uuid: str, name: str) -> Path:
    return Path(current_app.config["ARTIFACT_FOLDER"]) / document_uuid / f"{name}.png"


def document_preview(document) -> Image.Image:
    """Load a display-friendly image for a document (renders PDF page 1)."""
    path = document_absolute_path(document)
    if document.mime_type == "application/pdf":
        import fitz

        with fitz.open(path) as doc:
            page = doc.load_page(0)
            zoom = 2.0
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            image = Image.open(io.BytesIO(pix.tobytes("png")))
    else:
        image = Image.open(path)
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    max_side = 1800
    if max(image.size) > max_side:
        ratio = max_side / max(image.size)
        image = image.resize((int(image.width * ratio), int(image.height * ratio)), Image.LANCZOS)
    return image


def delete_document_files(document) -> None:
    delete_storage_file(document.stored_path)
    delete_storage_file(document.redacted_path)
    artifact_dir = Path(current_app.config["ARTIFACT_FOLDER"]) / document.uuid
    if artifact_dir.exists():
        for child in artifact_dir.iterdir():
            try:
                if child.is_file():
                    child.unlink()
            except OSError:
                pass
        try:
            os.rmdir(artifact_dir)
        except OSError:
            pass
    for report in list(document.reports):
        delete_storage_file(report.pdf_path)
        delete_storage_file(report.qr_path)
