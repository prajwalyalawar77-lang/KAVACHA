"""Authentication, registration and profile."""

from flask import Blueprint, current_app, g

from app.constants import ORG_TYPES, ROLE_INDUSTRIAL, ROLE_PUBLIC
from app.extensions import db
from app.models import Organisation, User
from app.routes.deps import json_body
from app.services.audit_service import log_action
from app.utils.limiter import rate_limit
from app.utils.responses import created, err, ok
from app.utils.security import auth_required, create_access_token, current_user
from app.utils.time import utcnow
from app.utils.validation import clean_text, is_valid_email, password_errors, parse_int

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

PUBLIC_SELF_SERVICE_ROLES = {ROLE_INDUSTRIAL, ROLE_PUBLIC}


def _org_from_payload(payload: dict):
    info = payload.get("organisation")
    if not isinstance(info, dict):
        return None, "Organisation details are required for industrial accounts."
    name = clean_text(info.get("name"), 255)
    if not name:
        return None, "Organisation name is required."
    org_type = clean_text(info.get("org_type"), 80) or "Other"
    if org_type not in ORG_TYPES:
        org_type = "Other"
    organisation = Organisation(
        name=name,
        org_type=org_type,
        gstin=(clean_text(info.get("gstin"), 15) or "").upper() or None,
        pan=(clean_text(info.get("pan"), 10) or "").upper() or None,
        address=clean_text(info.get("address"), 500),
        phone=clean_text(info.get("phone"), 32),
        email=clean_text(info.get("email"), 255),
        website=clean_text(info.get("website"), 255),
    )
    return organisation, None


@bp.post("/register")
@rate_limit(10, 300, "auth.register")
def register():
    payload = json_body()
    full_name = clean_text(payload.get("full_name"), 120)
    email = (clean_text(payload.get("email"), 255) or "").lower()
    password = payload.get("password") or ""
    role = (payload.get("role") or ROLE_PUBLIC).strip().lower()

    problems = []
    if not full_name:
        problems.append("Full name is required.")
    if not is_valid_email(email):
        problems.append("Enter a valid email address.")
    problems.extend(password_errors(password))
    if role not in PUBLIC_SELF_SERVICE_ROLES:
        return err("Choose either a public or industrial account.", 400, "invalid_role",
                   {"roles": sorted(PUBLIC_SELF_SERVICE_ROLES)})
    if problems:
        return err("Please correct the highlighted fields.", 422, "validation_error", {"problems": problems})

    if db.session.scalar(db.select(User).where(User.email == email)):
        return err("An account with this email already exists.", 409, "email_taken")

    organisation = None
    if role == ROLE_INDUSTRIAL:
        organisation, org_error = _org_from_payload(payload)
        if org_error:
            return err(org_error, 422, "validation_error")
        db.session.add(organisation)
        db.session.flush()

    user = User(
        email=email,
        full_name=full_name,
        role=role,
        organisation_id=organisation.id if organisation else None,
        phone=clean_text(payload.get("phone"), 32),
        retention_days=parse_int(payload.get("retention_days"), 30, 1, 365),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    log_action("auth.register", "user", user.id, {"role": role}, user=user)
    db.session.commit()
    token = create_access_token(user)
    return created({
        "token": token,
        "expires_in_minutes": current_app.config["JWT_EXPIRES_MINUTES"],
        "user": user.to_dict(),
    })


@bp.post("/login")
@rate_limit(12, 60, "auth.login")
def login():
    payload = json_body()
    email = (clean_text(payload.get("email"), 255) or "").lower()
    password = payload.get("password") or ""
    if not email or not password:
        return err("Email and password are required.", 422, "validation_error")
    user = db.session.scalar(db.select(User).where(User.email == email))
    if not user or not user.check_password(password):
        return err("Invalid email or password.", 401, "invalid_credentials")
    if not user.is_active:
        return err("This account has been deactivated. Contact an administrator.", 403, "account_inactive")
    user.last_login_at = utcnow()
    db.session.commit()
    log_action("auth.login", "user", user.id, None, user=user)
    db.session.commit()
    token = create_access_token(user)
    return ok({
        "token": token,
        "expires_in_minutes": current_app.config["JWT_EXPIRES_MINUTES"],
        "user": user.to_dict(),
    })


@bp.post("/logout")
@auth_required
def logout():
    log_action("auth.logout", "user", g.current_user.id)
    db.session.commit()
    return ok({"message": "Signed out. Discard the token on the client."})


@bp.get("/me")
@auth_required
def me():
    user = current_user()
    return ok({
        "user": user.to_dict(),
        "capabilities": {
            "role": user.role,
            "can_use_industrial": user.role == "industrial" and bool(user.organisation_id),
            "can_use_public": user.role == "public",
            "is_admin": user.role == "admin",
        },
    })


@bp.patch("/me")
@auth_required
def update_me():
    user = current_user()
    payload = json_body()
    if "full_name" in payload:
        name = clean_text(payload.get("full_name"), 120)
        if not name:
            return err("Full name cannot be empty.", 422, "validation_error")
        user.full_name = name
    if "phone" in payload:
        user.phone = clean_text(payload.get("phone"), 32)
    if "retention_days" in payload:
        days = parse_int(payload.get("retention_days"), user.retention_days, 1, 365)
        user.retention_days = days
    db.session.commit()
    log_action("user.update", "user", user.id, {"fields": sorted(payload.keys())})
    db.session.commit()
    return ok({"user": user.to_dict()})


@bp.post("/password")
@rate_limit(6, 300, "auth.password")
@auth_required
def change_password():
    user = current_user()
    payload = json_body()
    if not user.check_password(payload.get("current_password") or ""):
        return err("The current password is incorrect.", 401, "invalid_credentials")
    problems = password_errors(payload.get("new_password") or "")
    if problems:
        return err("Choose a stronger password.", 422, "validation_error", {"problems": problems})
    user.set_password(payload["new_password"])
    db.session.commit()
    log_action("user.password_change", "user", user.id)
    db.session.commit()
    return ok({"message": "Password updated."})


@bp.post("/role")
@auth_required
def select_role():
    user = current_user()
    if user.role == "admin":
        return err("Administrator roles are managed by the platform.", 403, "forbidden")
    payload = json_body()
    role = (payload.get("role") or "").strip().lower()
    if role not in PUBLIC_SELF_SERVICE_ROLES:
        return err("Choose either a public or industrial account.", 400, "invalid_role")
    if role == ROLE_INDUSTRIAL and not user.organisation_id:
        organisation, org_error = _org_from_payload(payload)
        if org_error:
            return err(org_error, 422, "validation_error")
        db.session.add(organisation)
        db.session.flush()
        user.organisation_id = organisation.id
    if role == ROLE_PUBLIC:
        user.organisation_id = None
    user.role = role
    db.session.commit()
    log_action("user.role_change", "user", user.id, {"role": role})
    db.session.commit()
    return ok({"user": user.to_dict()})


@bp.get("/config")
def auth_config():
    return ok({
        "roles": [{"value": "industrial", "label": "Industrial / Enterprise"},
                  {"value": "public", "label": "Public / Individual"}],
        "org_types": ORG_TYPES,
        "password_rules": "At least 8 characters with a letter and a number.",
    })
