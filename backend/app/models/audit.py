from app.extensions import db
from app.utils.time import iso, utcnow


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    action = db.Column(db.String(80), nullable=False, index=True)
    entity_type = db.Column(db.String(60))
    entity_id = db.Column(db.String(64))
    ip_address = db.Column(db.String(64))
    user_agent = db.Column(db.String(255))
    meta_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)

    user = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else "system",
            "user_email": self.user.email if self.user else None,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "ip_address": self.ip_address,
            "meta": self.meta_json or {},
            "created_at": iso(self.created_at),
        }
