from app.extensions import db
from app.utils.time import iso, utcnow


class Supplier(db.Model):
    __tablename__ = "suppliers"
    __table_args__ = (
        db.UniqueConstraint("organisation_id", "normalized_name", name="uq_supplier_org_name"),
    )

    id = db.Column(db.Integer, primary_key=True)
    organisation_id = db.Column(db.Integer, db.ForeignKey("organisations.id"), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    normalized_name = db.Column(db.String(255), nullable=False)
    gstin = db.Column(db.String(15), index=True)
    pan = db.Column(db.String(10))
    bank_account = db.Column(db.String(32))
    ifsc = db.Column(db.String(11))
    email = db.Column(db.String(255))
    phone = db.Column(db.String(32))
    address = db.Column(db.Text)
    status = db.Column(db.String(24), default="pending", nullable=False, index=True)
    trust_score = db.Column(db.Float, default=50)
    risk_summary = db.Column(db.Text)
    last_verified_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    invoices = db.relationship("Invoice", back_populates="supplier")
    alerts = db.relationship("FraudAlert", back_populates="supplier")

    def to_dict(self, include_stats: bool = False):
        data = {
            "id": self.id,
            "organisation_id": self.organisation_id,
            "name": self.name,
            "gstin": self.gstin,
            "pan": self.pan,
            "bank_account": self.bank_account,
            "ifsc": self.ifsc,
            "email": self.email,
            "phone": self.phone,
            "address": self.address,
            "status": self.status,
            "trust_score": round(self.trust_score or 0, 1),
            "risk_summary": self.risk_summary,
            "last_verified_at": iso(self.last_verified_at),
            "created_at": iso(self.created_at),
        }
        if include_stats:
            data["invoice_count"] = len(self.invoices)
            data["alert_count"] = len(self.alerts)
        return data


class Invoice(db.Model):
    __tablename__ = "invoices"
    __table_args__ = (
        db.Index("ix_invoice_org_number", "organisation_id", "normalized_number"),
    )

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), unique=True, nullable=False)
    organisation_id = db.Column(db.Integer, db.ForeignKey("organisations.id"), index=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), index=True)
    invoice_number = db.Column(db.String(80))
    normalized_number = db.Column(db.String(80), index=True)
    invoice_date = db.Column(db.Date)
    taxable_amount = db.Column(db.Numeric(14, 2))
    tax_amount = db.Column(db.Numeric(14, 2))
    total_amount = db.Column(db.Numeric(14, 2))
    currency = db.Column(db.String(8), default="INR")
    po_number = db.Column(db.String(80))
    gstin = db.Column(db.String(15), index=True)
    vendor_name = db.Column(db.String(255))
    buyer_name = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="invoices")
    supplier = db.relationship("Supplier", back_populates="invoices")

    def to_dict(self):
        return {
            "id": self.id,
            "document_id": self.document_id,
            "supplier_id": self.supplier_id,
            "invoice_number": self.invoice_number,
            "invoice_date": iso(self.invoice_date),
            "taxable_amount": float(self.taxable_amount) if self.taxable_amount is not None else None,
            "tax_amount": float(self.tax_amount) if self.tax_amount is not None else None,
            "total_amount": float(self.total_amount) if self.total_amount is not None else None,
            "currency": self.currency,
            "po_number": self.po_number,
            "gstin": self.gstin,
            "vendor_name": self.vendor_name,
            "buyer_name": self.buyer_name,
        }


class FraudAlert(db.Model):
    __tablename__ = "fraud_alerts"

    id = db.Column(db.Integer, primary_key=True)
    organisation_id = db.Column(db.Integer, db.ForeignKey("organisations.id"), index=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), index=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), index=True)
    alert_type = db.Column(db.String(60), nullable=False, index=True)
    severity = db.Column(db.String(20), default="medium", nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    evidence_json = db.Column(db.JSON)
    status = db.Column(db.String(20), default="open", nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    document = db.relationship("Document", back_populates="alerts")
    supplier = db.relationship("Supplier", back_populates="alerts")

    def to_dict(self):
        return {
            "id": self.id,
            "organisation_id": self.organisation_id,
            "document_id": self.document_id,
            "document_name": self.document.original_filename if self.document else None,
            "supplier_id": self.supplier_id,
            "supplier_name": self.supplier.name if self.supplier else None,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "evidence": self.evidence_json or {},
            "status": self.status,
            "created_at": iso(self.created_at),
        }


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    organisation_id = db.Column(db.Integer, db.ForeignKey("organisations.id"), index=True)
    kind = db.Column(db.String(40), default="system", index=True)
    severity = db.Column(db.String(20), default="info")
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text)
    link = db.Column(db.String(255))
    is_read = db.Column(db.Boolean, default=False, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "severity": self.severity,
            "title": self.title,
            "message": self.message,
            "link": self.link,
            "is_read": self.is_read,
            "created_at": iso(self.created_at),
        }
