from app.constants import DOC_STATUS_UPLOADED
from app.extensions import db
from app.utils.time import iso, utcnow


class Document(db.Model):
    __tablename__ = "documents"

    id = db.Column(db.Integer, primary_key=True)
    uuid = db.Column(db.String(32), unique=True, nullable=False, index=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    organisation_id = db.Column(db.Integer, db.ForeignKey("organisations.id"), index=True)
    original_filename = db.Column(db.String(255), nullable=False)
    stored_path = db.Column(db.String(512), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    sha256 = db.Column(db.String(64), nullable=False, index=True)
    portal = db.Column(db.String(20), default="industrial", nullable=False, index=True)
    doc_kind = db.Column(db.String(60), default="other", nullable=False, index=True)
    status = db.Column(db.String(20), default=DOC_STATUS_UPLOADED, nullable=False, index=True)
    status_message = db.Column(db.String(512))
    language = db.Column(db.String(20), default="eng")
    page_count = db.Column(db.Integer)
    expiry_date = db.Column(db.Date, index=True)
    redacted_path = db.Column(db.String(512))
    error_message = db.Column(db.String(512))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = db.Column(db.DateTime)

    owner = db.relationship("User", back_populates="documents")
    organisation = db.relationship("Organisation")
    metadata_record = db.relationship(
        "DocumentMetadata", back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    ocr_result = db.relationship(
        "OCRResult", back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    tampering = db.relationship(
        "TamperingAnalysis", back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    verification_results = db.relationship(
        "VerificationResult", back_populates="document", cascade="all, delete-orphan",
        order_by="VerificationResult.id",
    )
    risk_assessment = db.relationship(
        "RiskAssessment", back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    fingerprint = db.relationship(
        "DocumentFingerprint", back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    invoices = db.relationship(
        "Invoice", back_populates="document", cascade="all, delete-orphan"
    )
    alerts = db.relationship(
        "FraudAlert", back_populates="document", cascade="all, delete-orphan"
    )
    reports = db.relationship(
        "VerificationReport", back_populates="document", cascade="all, delete-orphan"
    )

    def to_dict(self, include_summary: bool = False):
        risk = self.risk_assessment
        data = {
            "id": self.id,
            "uuid": self.uuid,
            "owner_id": self.owner_id,
            "organisation_id": self.organisation_id,
            "original_filename": self.original_filename,
            "mime_type": self.mime_type,
            "file_size": self.file_size,
            "sha256": self.sha256,
            "doc_kind": self.doc_kind,
            "portal": self.portal,
            "status": self.status,
            "status_message": self.status_message,
            "language": self.language,
            "page_count": self.page_count,
            "expiry_date": iso(self.expiry_date),
            "created_at": iso(self.created_at),
            "risk": {
                "score": round(risk.score, 1),
                "category": risk.category,
                "confidence": round(risk.confidence, 2),
            } if risk else None,
        }
        if include_summary:
            data["owner"] = self.owner.full_name if self.owner else None
            data["invoice"] = self.invoices[0].to_dict() if self.invoices else None
            data["alert_count"] = len(self.alerts)
            data["report_count"] = len(self.reports)
        return data


class DocumentMetadata(db.Model):
    __tablename__ = "document_metadata"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), unique=True, nullable=False)
    title = db.Column(db.String(512))
    author = db.Column(db.String(255))
    subject = db.Column(db.String(512))
    keywords = db.Column(db.String(512))
    creator = db.Column(db.String(255))
    producer = db.Column(db.String(255))
    creation_date = db.Column(db.String(64))
    modification_date = db.Column(db.String(64))
    pdf_version = db.Column(db.String(32))
    is_encrypted = db.Column(db.Boolean, default=False)
    has_signature = db.Column(db.Boolean, default=False)
    signature_count = db.Column(db.Integer, default=0)
    sig_flags = db.Column(db.Integer)
    incremental_updates = db.Column(db.Integer, default=0)
    page_count = db.Column(db.Integer)
    fonts_json = db.Column(db.JSON)
    images_json = db.Column(db.JSON)
    raw_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="metadata_record")

    def to_dict(self):
        return {
            "title": self.title,
            "author": self.author,
            "subject": self.subject,
            "keywords": self.keywords,
            "creator": self.creator,
            "producer": self.producer,
            "creation_date": self.creation_date,
            "modification_date": self.modification_date,
            "pdf_version": self.pdf_version,
            "is_encrypted": self.is_encrypted,
            "has_signature": self.has_signature,
            "signature_count": self.signature_count,
            "sig_flags": self.sig_flags,
            "incremental_updates": self.incremental_updates,
            "page_count": self.page_count,
            "fonts": self.fonts_json or [],
            "images": self.images_json or [],
            "raw": self.raw_json or {},
        }


class OCRResult(db.Model):
    __tablename__ = "ocr_results"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), unique=True, nullable=False)
    engine = db.Column(db.String(60))
    language = db.Column(db.String(30))
    requested_language = db.Column(db.String(30))
    mean_confidence = db.Column(db.Float)
    text = db.Column(db.Text)
    words_json = db.Column(db.Text)
    fields_json = db.Column(db.JSON)
    word_count = db.Column(db.Integer, default=0)
    duration_ms = db.Column(db.Integer)
    status = db.Column(db.String(20), default="ok")
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="ocr_result")

    def to_dict(self, include_text: bool = True):
        data = {
            "engine": self.engine,
            "language": self.language,
            "requested_language": self.requested_language,
            "mean_confidence": self.mean_confidence,
            "word_count": self.word_count,
            "duration_ms": self.duration_ms,
            "status": self.status,
            "note": self.note,
        }
        if include_text:
            data["text"] = self.text
            data["fields"] = self.fields_json or {}
        return data


class TamperingAnalysis(db.Model):
    __tablename__ = "tampering_analysis"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), unique=True, nullable=False)
    engine_version = db.Column(db.String(40), default="forensics-1.0")
    analysis_pages = db.Column(db.Integer, default=0)
    ela_mean = db.Column(db.Float)
    ela_high_fraction = db.Column(db.Float)
    copy_move_pairs = db.Column(db.Integer, default=0)
    copy_move_score = db.Column(db.Float, default=0)
    noise_outlier_fraction = db.Column(db.Float)
    blockiness = db.Column(db.Float)
    blur_score = db.Column(db.Float)
    estimated_quality = db.Column(db.Integer)
    font_anomalies = db.Column(db.Integer, default=0)
    has_signature = db.Column(db.Boolean, default=False)
    signature_count = db.Column(db.Integer, default=0)
    incremental_updates = db.Column(db.Integer, default=0)
    heatmap_path = db.Column(db.String(512))
    overlay_path = db.Column(db.String(512))
    preview_path = db.Column(db.String(512))
    indicators_json = db.Column(db.JSON)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="tampering")
    regions = db.relationship(
        "SuspiciousRegion", back_populates="tampering", cascade="all, delete-orphan",
        order_by="SuspiciousRegion.score.desc()",
    )

    def to_dict(self):
        return {
            "engine_version": self.engine_version,
            "analysis_pages": self.analysis_pages,
            "ela_mean": self.ela_mean,
            "ela_high_fraction": self.ela_high_fraction,
            "copy_move_pairs": self.copy_move_pairs,
            "copy_move_score": self.copy_move_score,
            "noise_outlier_fraction": self.noise_outlier_fraction,
            "blockiness": self.blockiness,
            "blur_score": self.blur_score,
            "estimated_quality": self.estimated_quality,
            "font_anomalies": self.font_anomalies,
            "has_signature": self.has_signature,
            "signature_count": self.signature_count,
            "incremental_updates": self.incremental_updates,
            "indicators": self.indicators_json or [],
            "notes": self.notes,
            "regions": [r.to_dict() for r in self.regions],
        }


class SuspiciousRegion(db.Model):
    __tablename__ = "suspicious_regions"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=False, index=True)
    tampering_id = db.Column(db.Integer, db.ForeignKey("tampering_analysis.id"), nullable=False)
    x = db.Column(db.Float, nullable=False)
    y = db.Column(db.Float, nullable=False)
    w = db.Column(db.Float, nullable=False)
    h = db.Column(db.Float, nullable=False)
    score = db.Column(db.Float, default=0)
    label = db.Column(db.String(80))
    reason = db.Column(db.Text)
    sources = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    tampering = db.relationship("TamperingAnalysis", back_populates="regions")

    def to_dict(self):
        return {
            "id": self.id,
            "x": round(self.x, 4),
            "y": round(self.y, 4),
            "w": round(self.w, 4),
            "h": round(self.h, 4),
            "score": round(self.score or 0, 3),
            "label": self.label,
            "reason": self.reason,
            "sources": self.sources or [],
        }
