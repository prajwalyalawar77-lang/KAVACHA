from app.extensions import db
from app.utils.time import iso, utcnow


class VerificationResult(db.Model):
    __tablename__ = "verification_results"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=False, index=True)
    check_code = db.Column(db.String(80), nullable=False)
    check_name = db.Column(db.String(160), nullable=False)
    category = db.Column(db.String(40), default="verification")
    status = db.Column(db.String(20), nullable=False, index=True)  # passed/failed/warning/skipped/unverified
    severity = db.Column(db.String(20), default="info")
    message = db.Column(db.Text)
    expected = db.Column(db.String(255))
    actual = db.Column(db.String(255))
    details = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="verification_results")

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.check_code,
            "name": self.check_name,
            "category": self.category,
            "status": self.status,
            "severity": self.severity,
            "message": self.message,
            "expected": self.expected,
            "actual": self.actual,
            "details": self.details or {},
        }


class RiskAssessment(db.Model):
    __tablename__ = "risk_assessments"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), unique=True, nullable=False)
    score = db.Column(db.Float, default=0, nullable=False)
    category = db.Column(db.String(20), default="low", nullable=False, index=True)
    confidence = db.Column(db.Float, default=0)
    passed_count = db.Column(db.Integer, default=0)
    failed_count = db.Column(db.Integer, default=0)
    warning_count = db.Column(db.Integer, default=0)
    skipped_count = db.Column(db.Integer, default=0)
    summary = db.Column(db.Text)
    signals_json = db.Column(db.JSON)
    recommendations_json = db.Column(db.JSON)
    thresholds_json = db.Column(db.JSON)
    engine_version = db.Column(db.String(40))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="risk_assessment")

    def to_dict(self):
        return {
            "score": round(self.score or 0, 1),
            "category": self.category,
            "confidence": round(self.confidence or 0, 3),
            "counts": {
                "passed": self.passed_count,
                "failed": self.failed_count,
                "warning": self.warning_count,
                "skipped": self.skipped_count,
            },
            "summary": self.summary,
            "signals": self.signals_json or [],
            "recommendations": self.recommendations_json or [],
            "thresholds": self.thresholds_json or {},
            "engine_version": self.engine_version,
            "updated_at": iso(self.updated_at),
        }


class DocumentFingerprint(db.Model):
    __tablename__ = "document_fingerprints"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), unique=True, nullable=False)
    sha256 = db.Column(db.String(64), nullable=False, index=True)
    dhash = db.Column(db.String(32))
    ahash = db.Column(db.String(32))
    width = db.Column(db.Integer)
    height = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="fingerprint")

    def to_dict(self):
        return {
            "sha256": self.sha256,
            "dhash": self.dhash,
            "ahash": self.ahash,
            "width": self.width,
            "height": self.height,
        }


class DocumentVersion(db.Model):
    __tablename__ = "document_versions"

    id = db.Column(db.Integer, primary_key=True)
    organisation_id = db.Column(db.Integer, db.ForeignKey("organisations.id"), index=True)
    base_document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=False, index=True)
    compared_document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=False, index=True)
    similarity = db.Column(db.Float, default=0)
    diff_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    base_document = db.relationship("Document", foreign_keys=[base_document_id])
    compared_document = db.relationship("Document", foreign_keys=[compared_document_id])

    def to_dict(self):
        return {
            "id": self.id,
            "base_document_id": self.base_document_id,
            "compared_document_id": self.compared_document_id,
            "similarity": round(self.similarity or 0, 4),
            "diff": self.diff_json or {},
            "created_at": iso(self.created_at),
        }


class VerificationReport(db.Model):
    __tablename__ = "verification_reports"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=False, index=True)
    report_token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    pdf_path = db.Column(db.String(512))
    qr_path = db.Column(db.String(512))
    expires_at = db.Column(db.DateTime, index=True)
    revoked_at = db.Column(db.DateTime)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="reports")
    created_by = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "document_id": self.document_id,
            "report_token": self.report_token,
            "expires_at": iso(self.expires_at),
            "revoked_at": iso(self.revoked_at),
            "created_at": iso(self.created_at),
            "valid": not self.revoked_at and (self.expires_at is None or self.expires_at > utcnow()),
        }
