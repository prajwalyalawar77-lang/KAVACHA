import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, request

from app.extensions import db
from app.models import User
from app.utils.responses import err


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(minutes=current_app.config["JWT_EXPIRES_MINUTES"]),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])


def _extract_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            return err("Authentication required.", 401, "unauthorized")
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return err("Session expired. Please sign in again.", 401, "token_expired")
        except jwt.InvalidTokenError:
            return err("Invalid authentication token.", 401, "invalid_token")
        user = db.session.get(User, int(payload.get("sub", 0)))
        if not user or not user.is_active:
            return err("Account is inactive or no longer exists.", 401, "account_inactive")
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def roles_required(*roles: str):
    def decorator(fn):
        @auth_required
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if g.current_user.role not in roles:
                return err(
                    "You do not have permission to perform this action.",
                    403,
                    "forbidden",
                    {"required_roles": list(roles)},
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def admin_required(fn):
    return roles_required("admin")(fn)


def current_user() -> User:
    return g.current_user


def is_admin(user: User | None = None) -> bool:
    user = user or current_user()
    return user.role == "admin"


def can_access_document(user: User, document) -> bool:
    if user.role == "admin":
        return True
    if document.owner_id == user.id:
        return True
    if user.role == "industrial" and user.organisation_id and document.organisation_id == user.organisation_id:
        return True
    return False


def can_access_organisation(user: User, organisation_id: int | None) -> bool:
    if user.role == "admin":
        return True
    return bool(user.organisation_id and organisation_id == user.organisation_id)


def client_ip() -> str:
    if current_app.config.get("TRUST_PROXY_HEADERS"):
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
    return (request.remote_addr or "unknown")[:64]
