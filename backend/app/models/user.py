from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.utils.time import iso, utcnow


class Organisation(db.Model):
    __tablename__ = "organisations"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    org_type = db.Column(db.String(80), default="Other")
    gstin = db.Column(db.String(15))
    pan = db.Column(db.String(10))
    address = db.Column(db.Text)
    phone = db.Column(db.String(32))
    email = db.Column(db.String(255))
    website = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    members = db.relationship("User", back_populates="organisation", lazy="selectin")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "org_type": self.org_type,
            "gstin": self.gstin,
            "pan": self.pan,
            "address": self.address,
            "phone": self.phone,
            "email": self.email,
            "website": self.website,
            "created_at": iso(self.created_at),
        }


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), default="public", nullable=False, index=True)
    organisation_id = db.Column(db.Integer, db.ForeignKey("organisations.id"), index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    retention_days = db.Column(db.Integer, default=30)
    phone = db.Column(db.String(32))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    last_login_at = db.Column(db.DateTime)

    organisation = db.relationship("Organisation", back_populates="members")
    documents = db.relationship("Document", back_populates="owner", lazy="dynamic")

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self, include_org: bool = True):
        data = {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "organisation_id": self.organisation_id,
            "is_active": self.is_active,
            "retention_days": self.retention_days,
            "phone": self.phone,
            "created_at": iso(self.created_at),
            "last_login_at": iso(self.last_login_at),
        }
        if include_org:
            data["organisation"] = self.organisation.to_dict() if self.organisation else None
        return data
