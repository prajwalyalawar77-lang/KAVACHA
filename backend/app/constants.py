ROLE_ADMIN = "admin"
ROLE_INDUSTRIAL = "industrial"
ROLE_PUBLIC = "public"
ROLES = (ROLE_ADMIN, ROLE_INDUSTRIAL, ROLE_PUBLIC)
ROLE_LABELS = {
    ROLE_ADMIN: "Administrator",
    ROLE_INDUSTRIAL: "Industrial / Enterprise",
    ROLE_PUBLIC: "Public / Individual",
}

PORTAL_INDUSTRIAL = "industrial"
PORTAL_PUBLIC = "public"
PORTALS = (PORTAL_INDUSTRIAL, PORTAL_PUBLIC)

ORG_TYPES = [
    "Manufacturing",
    "Automobile",
    "Construction",
    "Pharmaceutical",
    "Logistics & Supply Chain",
    "Banking & Finance",
    "Government",
    "Education",
    "Other",
]

DOC_KIND_LABELS = {
    "invoice": "Tax Invoice",
    "purchase_order": "Purchase Order",
    "gst_certificate": "GST Certificate",
    "quality_certificate": "Quality / ISO Certificate",
    "contract": "Contract",
    "bank_letter": "Bank Letter",
    "supplier_document": "Supplier Document",
    "offer_letter": "Job Offer Letter",
    "salary_slip": "Salary Slip",
    "educational_certificate": "Educational Certificate",
    "rental_agreement": "Rental Agreement",
    "payment_receipt": "Payment Receipt",
    "identity_document": "Identity Document",
    "other": "Other Document",
}

KINDS_BY_PORTAL = {
    PORTAL_INDUSTRIAL: [
        "invoice", "purchase_order", "gst_certificate", "quality_certificate",
        "contract", "bank_letter", "supplier_document", "other",
    ],
    PORTAL_PUBLIC: [
        "offer_letter", "salary_slip", "educational_certificate", "rental_agreement",
        "payment_receipt", "identity_document", "other",
    ],
}

EXPIRY_KINDS = {
    "gst_certificate", "quality_certificate", "contract", "bank_letter",
    "educational_certificate", "identity_document",
}

DOC_STATUS_UPLOADED = "uploaded"
DOC_STATUS_PROCESSING = "processing"
DOC_STATUS_ANALYSED = "analysed"
DOC_STATUS_FAILED = "failed"
DOC_STATUS_DELETED = "deleted"

CHECK_PASS = "passed"
CHECK_FAIL = "failed"
CHECK_WARN = "warning"
CHECK_SKIP = "skipped"
CHECK_UNVERIFIED = "unverified"

RISK_LOW = "low"
RISK_MEDIUM = "medium"
RISK_HIGH = "high"
RISK_CRITICAL = "critical"

ALERT_OPEN = "open"
ALERT_ACK = "acknowledged"
ALERT_DISMISSED = "dismissed"

SUPPLIER_PENDING = "pending"
SUPPLIER_VERIFIED = "verified"
SUPPLIER_REVIEW = "review_required"
SUPPLIER_FLAGGED = "flagged"

SEVERITY_INFO = "info"
SEVERITY_LOW = "low"
SEVERITY_MEDIUM = "medium"
SEVERITY_HIGH = "high"
SEVERITY_CRITICAL = "critical"

DISCLAIMER = (
    "KAVACHA combines automated document-forensics indicators and rule-based checks. "
    "Risk scores use configurable demonstration thresholds and are not calibrated fraud "
    "probabilities. Indicators (such as metadata anomalies or noise inconsistency) are "
    "not proof of forgery. External GST, bank or government verification is only performed "
    "when authorised integrations are configured; otherwise results are clearly marked as "
    "format validation or unverified. Always obtain independent confirmation before acting."
)
