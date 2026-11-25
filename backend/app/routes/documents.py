"""Document upload, listing, analysis, previews and secure deletion."""

import re

from flask import Blueprint, g, request, send_file

from app.constants import DOC_KIND_LABELS, KINDS_BY_PORTAL, PORTALS
from app.extensions import db
from app.models import Document, Invoice, RiskAssessment
from app.routes.deps import get_document, json_body, paginate, risk_category_filter, scoped_documents
from app.services.audit_service import log_action
from app.services.document_service import (
    DocumentError, analysis_progress, create_document, delete_document, document_detail,
    run_analysis,
)
from app.services.file_service import artifact_path, document_preview
from app.utils.files import resolve_storage_path
from app.utils.responses import created, err, ok, pagination_meta
from app.utils.security import auth_required
from app.utils.time import parse_date

bp = Blueprint("documents", __name__, url_prefix="/api/documents")

ARTIFACT_NAME_RE = re.compile(r"^[A-Za-z0-9_\-]{1,60}$")


def _upload_response(document: Document, analysis: dict | None, analysis_error: str | None):
    return created({
        "document": document.to_dict(),
        "progress": analysis_progress(document),
        "analysis": analysis,
        "analysis_error": analysis_error,
    })


@bp.post("")
@auth_required
def upload_document():
    portal = request.form.get("portal") or "public"
    doc_kind = request.form.get("doc_kind") or "other"
    if portal not in PORTALS:
        return err("Select a valid portal (industrial or public).", 422, "validation_error")
    if doc_kind not in KINDS_BY_PORTAL[portal]:
        return err("Select a valid document type for this portal.", 422, "validation_error")
    file_storage = request.files.get("file")
    if not file_storage:
        return err("Attach a PDF, JPG, JPEG or PNG file.", 422, "file_required")
    document = create_document(
        file_storage,
        g.current_user,
        portal=portal,
        doc_kind=doc_kind,
        language=request.form.get("language") or None,
        expiry_date=request.form.get("expiry_date") or None,
    )
    analysis = None
    analysis_error = None
    auto_analyse = (request.form.get("auto_analyse") or "true").lower() != "false"
    if auto_analyse:
        try:
            analysis = run_analysis(document, request.form.get("language") or None)
        except Exception as exc:
            db.session.refresh(document)
            analysis_error = f"{type(exc).__name__}: {str(exc)[:200]}"
    return _upload_response(document, analysis, analysis_error)


@bp.get("")
@auth_required
def list_documents():
    user = g.current_user
    stmt = scoped_documents(user)
    portal = request.args.get("portal")
    if portal in PORTALS:
        stmt = stmt.where(Document.portal == portal)
    kind = request.args.get("kind")
    if kind in DOC_KIND_LABELS:
        stmt = stmt.where(Document.doc_kind == kind)
    status = request.args.get("status")
    if status in ("uploaded", "processing", "analysed", "failed", "deleted"):
        stmt = stmt.where(Document.status == status)
    category = request.args.get("risk")
    if category:
        stmt = risk_category_filter(stmt, category.lower())
    query = (request.args.get("q") or "").strip()
    if query:
        like = f"%{query}%"
        if re.fullmatch(r"[0-9a-fA-F]{64}", query):
            stmt = stmt.where(Document.sha256 == query.lower())
        else:
            stmt = stmt.where(db.or_(Document.original_filename.ilike(like),
                                     Document.sha256.ilike(like)))
    supplier_id = request.args.get("supplier_id", type=int)
    if supplier_id:
        stmt = stmt.where(Document.id.in_(
            db.select(Invoice.document_id).where(Invoice.supplier_id == supplier_id)
        ))
    date_from, _ = parse_date(request.args.get("date_from"))
    if date_from:
        stmt = stmt.where(db.func.date(Document.created_at) >= date_from)
    date_to, _ = parse_date(request.args.get("date_to"))
    if date_to:
        stmt = stmt.where(db.func.date(Document.created_at) <= date_to)

    sort = request.args.get("sort") or "created_at"
    direction = request.args.get("direction") or "desc"
    if sort == "risk":
        stmt = stmt.outerjoin(RiskAssessment, RiskAssessment.document_id == Document.id)
        column = RiskAssessment.score
    elif sort == "filename":
        column = Document.original_filename
    elif sort == "status":
        column = Document.status
    else:
        column = Document.created_at
    stmt = stmt.order_by(column.desc() if direction != "asc" else column.asc())
    rows, total, page, per_page = paginate(stmt, default_per_page=12)
    return ok({
        "documents": [row.to_dict(include_summary=True) for row in rows],
        "filters": {
            "portal": portal, "kind": kind, "status": status, "risk": category,
            "q": query, "sort": sort, "direction": direction,
        },
    }, meta=pagination_meta(total, page, per_page))


@bp.get("/<int:document_id>")
@auth_required
def get_document_detail(document_id: int):
    document = get_document(document_id, g.current_user)
    return ok(document_detail(document))


@bp.get("/<int:document_id>/status")
@auth_required
def get_document_status(document_id: int):
    document = get_document(document_id, g.current_user)
    return ok({
        "document": document.to_dict(),
        "progress": analysis_progress(document),
        "risk": document.risk_assessment.to_dict() if document.risk_assessment else None,
    })


@bp.post("/<int:document_id>/analyse")
@auth_required
def analyse_document(document_id: int):
    document = get_document(document_id, g.current_user)
    payload = json_body()
    try:
        result = run_analysis(document, payload.get("language"))
    except Exception as exc:
        db.session.refresh(document)
        return err(f"Analysis failed: {type(exc).__name__}", 500, "analysis_failed", {
            "document_id": document.id,
            "error": document.error_message,
            "progress": analysis_progress(document),
        })
    return ok({"analysis": result, "document": document.to_dict(), "progress": analysis_progress(document)})


@bp.patch("/<int:document_id>")
@auth_required
def update_document(document_id: int):
    document = get_document(document_id, g.current_user)
    payload = json_body()
    if "doc_kind" in payload:
        kind = (payload.get("doc_kind") or "").strip().lower()
        if kind not in KINDS_BY_PORTAL[document.portal]:
            return err("Select a valid document type for this portal.", 422, "validation_error")
        document.doc_kind = kind
    if "expiry_date" in payload:
        if payload.get("expiry_date") in (None, ""):
            document.expiry_date = None
        else:
            parsed, error = parse_date(payload.get("expiry_date"))
            if error:
                return err(error, 422, "validation_error")
            document.expiry_date = parsed
    if "language" in payload:
        language = (payload.get("language") or "").strip().lower()
        if language not in ("eng", "kan", "eng+kan"):
            return err("Supported OCR languages are eng, kan or eng+kan.", 422, "validation_error")
        document.language = language
    db.session.commit()
    log_action("document.update", "document", document.id, {"fields": sorted(payload.keys())})
    db.session.commit()
    return ok({"document": document.to_dict()})


@bp.delete("/<int:document_id>")
@auth_required
def remove_document(document_id: int):
    document = get_document(document_id, g.current_user)
    user = g.current_user
    if user.role != "admin" and document.owner_id != user.id:
        raise DocumentError("Only the uploader or an administrator can delete this document.", 403, "forbidden")
    summary = delete_document(document)
    return ok({
        "message": "Document and all derived analysis data were securely deleted.",
        "removed": summary,
    })


@bp.get("/<int:document_id>/preview")
@auth_required
def document_preview_image(document_id: int):
    document = get_document(document_id, g.current_user, allow_deleted=True)
    variant = (request.args.get("variant") or "original").lower()
    if variant in ("heatmap", "overlay"):
        tampering = document.tampering
        stored = tampering.heatmap_path if variant == "heatmap" else tampering.overlay_path
        if not stored:
            return err("The forensic heatmap is not available for this document.", 404, "no_artifact")
        path = resolve_storage_path(stored)
        if not path or not path.exists():
            return err("The forensic heatmap artefact is missing.", 404, "no_artifact")
        return send_file(path, mimetype="image/png", max_age=0)
    if variant == "redacted":
        if not document.redacted_path:
            return err("No redacted copy exists yet.", 404, "no_artifact")
        path = resolve_storage_path(document.redacted_path)
        if not path or not path.exists():
            return err("The redacted copy is missing.", 404, "no_artifact")
        return send_file(path, mimetype="image/png", max_age=0)
    try:
        cached = artifact_path(document.uuid, "preview")
        if cached.exists():
            return send_file(cached, mimetype="image/png", max_age=0)
        image = document_preview(document)
        from app.services.file_service import save_pil_artifact

        save_pil_artifact(document.uuid, "preview", image)
        return send_file(artifact_path(document.uuid, "preview"), mimetype="image/png", max_age=0)
    except Exception as exc:
        return err(f"Preview could not be rendered: {type(exc).__name__}", 422, "preview_failed")


@bp.get("/<int:document_id>/artifacts/<name>")
@auth_required
def document_artifact(document_id: int, name: str):
    document = get_document(document_id, g.current_user, allow_deleted=True)
    if not ARTIFACT_NAME_RE.match(name):
        return err("Unknown artefact.", 404, "no_artifact")
    path = artifact_path(document.uuid, name)
    if not path.exists():
        return err("Unknown artefact.", 404, "no_artifact")
    return send_file(path, mimetype="image/png", max_age=0)


@bp.get("/reference-data")
@auth_required
def reference_data():
    return ok({
        "portals": list(PORTALS),
        "kinds_by_portal": KINDS_BY_PORTAL,
        "doc_kinds": DOC_KIND_LABELS,
        "languages": ["eng", "kan", "eng+kan"],
        "max_upload_mb": 25,
    })


@bp.get("/duplicate-check")
@auth_required
def duplicate_check():
    user = g.current_user
    sha256 = (request.args.get("sha256") or "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sha256):
        return err("Provide a SHA-256 digest to check.", 422, "validation_error")
    stmt = db.select(Document).where(Document.sha256 == sha256,
                                     Document.deleted_at.is_(None)).limit(5)
    if user.role != "admin":
        if user.role == "industrial" and user.organisation_id:
            stmt = stmt.where(db.or_(Document.organisation_id == user.organisation_id,
                                     Document.owner_id == user.id))
        else:
            stmt = stmt.where(Document.owner_id == user.id)
    matches = db.session.scalars(stmt).all()
    return ok({
        "exact_duplicates": [match.to_dict() for match in matches],
        "count": len(matches),
        "note": "Exact duplicates are based on the SHA-256 digest of the uploaded bytes.",
    })
