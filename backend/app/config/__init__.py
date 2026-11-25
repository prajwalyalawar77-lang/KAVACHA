import os
from pathlib import Path


def _find_project_root() -> Path:
    here = Path(__file__).resolve()
    # backend/app/config/__init__.py -> KAVACHA
    return here.parents[3]


PROJECT_ROOT = _find_project_root()
_ROOT = PROJECT_ROOT


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:  # python-dotenv optional; environment variables still work
        return
    for candidate in (PROJECT_ROOT / ".env", PROJECT_ROOT / "backend" / ".env"):
        if candidate.exists():
            load_dotenv(candidate, override=False)


_load_dotenv()


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_list(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _default_qr_base() -> str:
    explicit = _env("QR_BASE_URL", "").strip()
    if explicit:
        return explicit
    # Hosts like Render expose their public origin at runtime.
    external = _env("RENDER_EXTERNAL_URL", "").strip()
    if external:
        return f"{external.rstrip('/')}/verify"
    # Hugging Face Spaces expose the host without a scheme.
    space = _env("SPACE_HOST", "").strip()
    if space:
        return f"https://{space.rstrip('/')}/verify"
    return "http://kavacha.localhost:5173/verify"


class Config:
    PROJECT_ROOT = str(_ROOT)
    ENV = _env("FLASK_ENV", "development")
    DEBUG = ENV != "production"
    # Always return JSON error envelopes instead of HTML debug pages.
    PROPAGATE_EXCEPTIONS = False

    SECRET_KEY = _env("SECRET_KEY", "kavacha-dev-secret-change-in-production")
    JWT_SECRET = _env("JWT_SECRET", SECRET_KEY)
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRES_MINUTES = _env_int("JWT_EXPIRES_MINUTES", 720)
    DEFAULT_DEV_SECRET = SECRET_KEY == "kavacha-dev-secret-change-in-production"

    _default_db = f"sqlite:///{(_ROOT / 'backend' / 'instance' / 'kavacha.db').as_posix()}"
    SQLALCHEMY_DATABASE_URI = _env("DATABASE_URL", _default_db)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    STORAGE_ROOT = Path(_env("STORAGE_ROOT", str(_ROOT / "storage"))).resolve()
    UPLOAD_FOLDER = STORAGE_ROOT / "uploads"
    ARTIFACT_FOLDER = STORAGE_ROOT / "artifacts"
    REPORT_FOLDER = STORAGE_ROOT / "reports"
    REDACTED_FOLDER = STORAGE_ROOT / "redacted"

    MAX_CONTENT_LENGTH = _env_int("MAX_UPLOAD_MB", 25) * 1024 * 1024
    MAX_UPLOAD_MB = _env_int("MAX_UPLOAD_MB", 25)
    ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png"}
    ALLOWED_MIME_TYPES = {
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "application/octet-stream",  # some browsers send this; magic bytes are still checked
    }

    CORS_ORIGINS = _env_list(
        "CORS_ORIGINS",
        "http://localhost:5173,http://kavacha.localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
    )

    # Demo thresholds (configurable). These are NOT calibrated fraud probabilities.
    RISK_MEDIUM_THRESHOLD = _env_int("RISK_MEDIUM_THRESHOLD", 30)
    RISK_HIGH_THRESHOLD = _env_int("RISK_HIGH_THRESHOLD", 60)
    RISK_CRITICAL_THRESHOLD = _env_int("RISK_CRITICAL_THRESHOLD", 80)
    RISK_ENGINE_VERSION = "kavacha-risk-1.0"

    AUTH_RATE_LIMIT = _env_int("AUTH_RATE_LIMIT", 12)  # requests
    AUTH_RATE_WINDOW = _env_int("AUTH_RATE_WINDOW", 60)  # seconds
    API_RATE_LIMIT = _env_int("API_RATE_LIMIT", 600)
    API_RATE_WINDOW = _env_int("API_RATE_WINDOW", 60)

    OCR_LANGUAGES = _env_list("OCR_LANGUAGES", "eng,kan")
    OCR_MAX_WORDS = _env_int("OCR_MAX_WORDS", 4000)
    ANALYSIS_MAX_PAGES = _env_int("ANALYSIS_MAX_PAGES", 3)

    QR_BASE_URL = _default_qr_base()
    REPORT_EXPIRY_DAYS = _env_int("REPORT_EXPIRY_DAYS", 90)

    # Render and similar hosts terminate TLS at a proxy. Enable when the proxy
    # sets X-Forwarded-Proto so Flask knows the request is HTTPS (HSTS, URLs).
    TRUST_PROXY = _env("TRUST_PROXY", "0") == "1"
    # Serve frontend/dist from Flask when it exists (single-service deployment).
    SERVE_FRONTEND = _env("SERVE_FRONTEND", "1") == "1"

    # Optional external verification providers. When absent, KAVACHA explicitly
    # reports that external verification was NOT performed (never fabricated).
    EXTERNAL_GST_API_URL = _env("EXTERNAL_GST_API_URL", "")
    EXTERNAL_GST_API_KEY = _env("EXTERNAL_GST_API_KEY", "")
    EXTERNAL_BANK_API_URL = _env("EXTERNAL_BANK_API_URL", "")
    EXTERNAL_BANK_API_KEY = _env("EXTERNAL_BANK_API_KEY", "")

    DEFAULT_RETENTION_DAYS = _env_int("DEFAULT_RETENTION_DAYS", 30)
    SOFTWARE_VERSION = "1.0.0"


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    WTF_CSRF_ENABLED = False
    STORAGE_ROOT = Path(_env("TEST_STORAGE_ROOT", str(_ROOT / "storage" / "_test"))).resolve()
    UPLOAD_FOLDER = STORAGE_ROOT / "uploads"
    ARTIFACT_FOLDER = STORAGE_ROOT / "artifacts"
    REPORT_FOLDER = STORAGE_ROOT / "reports"
    REDACTED_FOLDER = STORAGE_ROOT / "redacted"
    JWT_EXPIRES_MINUTES = 60
    SERVE_FRONTEND = False
    TRUST_PROXY = False
