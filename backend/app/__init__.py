"""KAVACHA application factory."""

import logging
import sqlite3
import time
from pathlib import Path

import click
from flask import Flask, abort, jsonify, request, send_from_directory
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from app.config import Config
from app.constants import DISCLAIMER
from app.extensions import cors, db
from app.modules.industrial_intelligence.engine import SupplierError
from app.modules.smart_verification.comparison import ComparisonError
from app.services.document_service import DocumentError
from app.services.file_service import UploadError
from app.routes import register_blueprints
from app.utils.limiter import check_rate_limit
from app.utils.responses import err

_PRAGMAS_REGISTERED = False


def _register_sqlite_pragmas() -> None:
    global _PRAGMAS_REGISTERED
    if _PRAGMAS_REGISTERED:
        return

    @event.listens_for(Engine, "connect")
    def _set_pragmas(dbapi_connection, _connection_record):
        if isinstance(dbapi_connection, sqlite3.Connection):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
            finally:
                cursor.close()

    _PRAGMAS_REGISTERED = True


def _prepare_folders(app: Flask) -> None:
    for key in ("UPLOAD_FOLDER", "ARTIFACT_FOLDER", "REPORT_FOLDER", "REDACTED_FOLDER"):
        Path(app.config[key]).mkdir(parents=True, exist_ok=True)
    Path(app.config["PROJECT_ROOT"], "backend", "instance").mkdir(parents=True, exist_ok=True)


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(DocumentError)
    def _document_error(exc: DocumentError):
        return err(exc.message, exc.status, exc.code)

    @app.errorhandler(UploadError)
    def _upload_error(exc: UploadError):
        return err(exc.message, exc.status, exc.code)

    @app.errorhandler(SupplierError)
    def _supplier_error(exc: SupplierError):
        return err(exc.message, exc.status, exc.code)

    @app.errorhandler(ComparisonError)
    def _comparison_error(exc: ComparisonError):
        return err(exc.message, exc.status, exc.code)

    @app.errorhandler(IntegrityError)
    def _integrity_error(exc: IntegrityError):
        db.session.rollback()
        app.logger.warning("Database integrity error: %s", exc)
        return err("This action conflicts with existing data.", 409, "conflict")

    @app.errorhandler(HTTPException)
    def _http_error(exc: HTTPException):
        if exc.code == 413:
            return err(
                f"The upload exceeds the {app.config['MAX_UPLOAD_MB']} MB limit.",
                413,
                "file_too_large",
            )
        if exc.code == 415:
            return err("Unsupported content type.", 415, "unsupported_media_type")
        message = exc.description or "Request could not be completed."
        code = (exc.name or "http_error").lower().replace(" ", "_")
        return err(message, exc.code or 500, code)

    @app.errorhandler(Exception)
    def _unexpected(exc: Exception):
        db.session.rollback()
        app.logger.exception("Unhandled error on %s %s", request.method, request.path)
        if app.config.get("DEBUG") and not app.config.get("TESTING"):
            return err(f"{type(exc).__name__}: {exc}", 500, "internal_error")
        return err("An unexpected error occurred. The action may not have completed.", 500, "internal_error")


def _register_middleware(app: Flask) -> None:
    @app.before_request
    def _api_limits():
        if request.method == "OPTIONS" or not request.path.startswith("/api/"):
            return None
        limited = check_rate_limit(
            app.config["API_RATE_LIMIT"], app.config["API_RATE_WINDOW"], "api"
        )
        if limited is not None:
            return limited
        return None

    @app.after_request
    def _security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.path.startswith("/api/") or request.path.startswith("/reports/"):
            response.headers["Cache-Control"] = "no-store"
        if request.is_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.after_request
    def _slow_request_log(response):
        started = getattr(request, "_kavacha_started", None)
        if started and (time.monotonic() - started) > 3:
            app.logger.warning("Slow request %s %s took %.1fs",
                               request.method, request.path, time.monotonic() - started)
        return response

    @app.before_request
    def _mark_start():
        request._kavacha_started = time.monotonic()
        return None


def _register_cli(app: Flask) -> None:
    @app.cli.command("init-db")
    def init_db():
        """Create all database tables."""
        db.create_all()
        click.echo("Database tables created.")

    @app.cli.command("seed-demo")
    @click.option("--with-documents", is_flag=True, help="Also generate synthetic demo documents.")
    def seed_demo(with_documents):
        """Seed demo accounts, organisations and suppliers."""
        from app.seed import seed

        summary = seed(with_documents=with_documents)
        click.echo(summary)


def create_app(config_object=None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object or Config)
    app.json.sort_keys = False
    if app.config.get("TRUST_PROXY"):
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    if app.config.get("TESTING") and app.config["SQLALCHEMY_DATABASE_URI"] == "sqlite://":
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            "poolclass": StaticPool,
            "connect_args": {"check_same_thread": False},
        }

    if app.config.get("DEFAULT_DEV_SECRET") and not app.config.get("TESTING"):
        app.logger.warning(
            "KAVACHA is using the development secret. Set SECRET_KEY and JWT_SECRET "
            "environment variables before any real deployment."
        )
    if not app.config.get("TESTING"):
        logging.getLogger("werkzeug").setLevel(logging.INFO)

    _prepare_folders(app)
    Path(app.config["PROJECT_ROOT"], "storage").mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        expose_headers=["Content-Disposition"],
        max_age=600,
    )
    _register_sqlite_pragmas()
    register_blueprints(app)
    _register_error_handlers(app)
    _register_middleware(app)
    _register_cli(app)

    frontend_dist = Path(app.config["PROJECT_ROOT"]) / "frontend" / "dist"
    serve_frontend = bool(app.config.get("SERVE_FRONTEND")) and (frontend_dist / "index.html").is_file()

    def _frontend_index():
        response = send_from_directory(str(frontend_dist), "index.html")
        response.cache_control.no_cache = True
        return response

    @app.get("/")
    def index():
        if serve_frontend:
            return _frontend_index()
        return jsonify({
            "service": "KAVACHA API",
            "tagline": "One Document. Multiple Checks. Complete Trust.",
            "version": app.config["SOFTWARE_VERSION"],
            "docs": "/api/meta",
            "health": "/api/health",
            "disclaimer": DISCLAIMER,
        })

    if serve_frontend:
        @app.get("/<path:path>")
        def frontend(path: str):
            if path.startswith(("api/", "reports/")):
                abort(404)
            target = frontend_dist / path
            if target.is_file():
                response = send_from_directory(str(frontend_dist), path)
                if path.startswith("assets/"):
                    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
                return response
            if path.startswith("assets/") or "." in Path(path).name:
                abort(404)
            return _frontend_index()

    with app.app_context():
        db.create_all()

    return app


__all__ = ["create_app"]
