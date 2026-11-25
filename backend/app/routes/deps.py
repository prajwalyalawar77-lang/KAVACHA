"""Shared helpers for API blueprints."""

from flask import request
from sqlalchemy import func

from app.extensions import db
from app.models import Document
from app.services.document_service import DocumentError
from app.utils.security import can_access_document


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def get_document(document_id: int, user, allow_deleted: bool = False) -> Document:
    document = db.session.get(Document, document_id)
    if not document:
        raise DocumentError("Document not found.", 404, "not_found")
    if document.deleted_at and not allow_deleted:
        raise DocumentError("Document not found.", 404, "not_found")
    if not can_access_document(user, document):
        # Do not reveal that the document exists.
        raise DocumentError("Document not found.", 404, "not_found")
    return document


def scoped_documents(user):
    stmt = db.select(Document).where(Document.deleted_at.is_(None))
    if user.role == "admin":
        return stmt
    if user.role == "industrial" and user.organisation_id:
        return stmt.where(db.or_(
            Document.organisation_id == user.organisation_id,
            Document.owner_id == user.id,
        ))
    return stmt.where(Document.owner_id == user.id)


def paginate(stmt, default_per_page: int = 15, max_per_page: int = 100):
    page = max(1, request.args.get("page", type=int) or 1)
    per_page = request.args.get("per_page", type=int) or default_per_page
    per_page = min(max_per_page, max(1, per_page))
    count_stmt = db.select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.session.scalar(count_stmt) or 0
    rows = db.session.scalars(stmt.limit(per_page).offset((page - 1) * per_page)).all()
    return rows, total, page, per_page


def risk_category_filter(stmt, category: str):
    from app.models import RiskAssessment

    if category in ("low", "medium", "high", "critical"):
        stmt = stmt.join(RiskAssessment, RiskAssessment.document_id == Document.id).where(
            RiskAssessment.category == category)
    elif category == "unassessed":
        stmt = stmt.where(~Document.risk_assessment.has())
    return stmt
