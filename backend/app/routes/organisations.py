"""Organisation profile for industrial accounts."""

from flask import Blueprint, g

from app.constants import ORG_TYPES
from app.extensions import db
from app.models import Organisation, User
from app.modules.smart_verification.validators import validate_gstin, validate_pan
from app.routes.deps import json_body
from app.services.audit_service import log_action
from app.utils.responses import err, ok
from app.utils.security import auth_required
from app.utils.validation import clean_text

bp = Blueprint("organisations", __name__, url_prefix="/api/organisations")


@bp.get("/current")
@auth_required
def current_organisation():
    user = g.current_user
    return ok({
        "organisation": user.organisation.to_dict() if user.organisation else None,
        "org_types": ORG_TYPES,
        "members": sum(1 for member in (user.organisation.members if user.organisation else [])
                       if member.is_active),
    })


@bp.put("/current")
@auth_required
def upsert_organisation():
    user: User = g.current_user
    if user.role != "industrial":
        return err("Only industrial accounts manage an organisation profile.", 403, "forbidden")
    payload = json_body()
    name = clean_text(payload.get("name"), 255)
    if not name:
        return err("Organisation name is required.", 422, "validation_error")
    org_type = clean_text(payload.get("org_type"), 80) or "Other"
    if org_type not in ORG_TYPES:
        org_type = "Other"
    organisation = user.organisation or Organisation()
    organisation.name = name
    organisation.org_type = org_type
    organisation.gstin = (clean_text(payload.get("gstin"), 15) or "").upper() or None
    organisation.pan = (clean_text(payload.get("pan"), 10) or "").upper() or None
    organisation.address = clean_text(payload.get("address"), 500)
    organisation.phone = clean_text(payload.get("phone"), 32)
    organisation.email = clean_text(payload.get("email"), 255)
    organisation.website = clean_text(payload.get("website"), 255)
    if organisation.id is None:
        db.session.add(organisation)
        db.session.flush()
        user.organisation_id = organisation.id
    db.session.commit()
    warnings = []
    if organisation.gstin:
        result = validate_gstin(organisation.gstin)
        if not result["valid"]:
            warnings.append("Organisation GSTIN failed format/checksum validation: " + " ".join(result["errors"]))
    if organisation.pan:
        result = validate_pan(organisation.pan)
        if not result["valid"]:
            warnings.append("Organisation PAN failed format validation.")
    log_action("organisation.update", "organisation", organisation.id, {"name": name})
    return ok({"organisation": organisation.to_dict(), "warnings": warnings,
               "note": "GSTIN/PAN checks are format validation only; no government lookup is performed."})
