"""Demo seed data for KAVACHA.

Creates three accounts (admin / industrial / public), a demo organisation,
two suppliers, and — with --with-documents — a set of synthetic documents that
are pushed through the real analysis pipeline. Nothing here is a pre-baked
score: risk values come out of the same engine the API uses.
"""

import io

from werkzeug.datastructures import FileStorage

from app.constants import DOC_STATUS_ANALYSED, ROLE_ADMIN, ROLE_INDUSTRIAL, ROLE_PUBLIC, SUPPLIER_PENDING
from app.demo_documents import (
    BUYER,
    VENDOR,
    gst_certificate_pdf,
    invoice_pdf,
    offer_letter_pdf,
    purchase_order_pdf,
    tamper_invoice,
)
from app.extensions import db
from app.models import Document, Organisation, Supplier, User
from app.services.document_service import create_document, run_analysis
from app.utils.text import normalize_name
from app.utils.time import utcnow

DEMO_PASSWORD = "Kavacha@2026"

ADMIN_EMAIL = "admin@kavacha.demo"
INDUSTRIAL_EMAIL = "ops@sunrise.example"
PUBLIC_EMAIL = "priya@public.example"


def _organisation(name, **fields):
    org = db.session.scalars(db.select(Organisation).where(Organisation.name == name)).first()
    if org:
        return org, False
    org = Organisation(name=name, **fields)
    db.session.add(org)
    db.session.commit()
    return org, True


def _user(email, full_name, role, organisation=None, phone=None, retention_days=30):
    user = db.session.scalars(db.select(User).where(User.email == email)).first()
    if user:
        return user, False
    user = User(
        email=email,
        full_name=full_name,
        role=role,
        organisation_id=organisation.id if organisation else None,
        phone=phone,
        retention_days=retention_days,
    )
    user.set_password(DEMO_PASSWORD)
    db.session.add(user)
    db.session.commit()
    return user, True


def _supplier(organisation, name, **fields):
    normalized = normalize_name(name)
    supplier = db.session.scalars(
        db.select(Supplier).where(
            Supplier.organisation_id == organisation.id,
            Supplier.normalized_name == normalized,
        )
    ).first()
    if supplier:
        return supplier, False
    supplier = Supplier(
        organisation_id=organisation.id,
        name=name,
        normalized_name=normalized,
        status=SUPPLIER_PENDING,
        trust_score=50,
        risk_summary=(
            "Seeded demo supplier. Identifiers were format-checked locally only; "
            "no GST or bank lookup has been performed."
        ),
        **fields,
    )
    db.session.add(supplier)
    db.session.commit()
    return supplier, True


def _existing_document(user, filename):
    return db.session.scalars(
        db.select(Document).where(Document.owner_id == user.id,
                                  Document.original_filename == filename)
    ).first()


def _upload(user, portal, doc_kind, filename, payload, mime):
    storage = FileStorage(stream=io.BytesIO(payload), filename=filename, content_type=mime)
    return create_document(storage, user, portal=portal, doc_kind=doc_kind)


def _demo_documents(industrial, public_user):
    created = []
    invoice_bytes = invoice_pdf()
    plan = [
        (industrial, "industrial", "invoice", "demo-invoice-INV-2026-0088.pdf", invoice_bytes, "application/pdf"),
        (industrial, "industrial", "invoice", "demo-invoice-INV-2026-0088-tampered.png",
         tamper_invoice(invoice_bytes), "image/png"),
        (industrial, "industrial", "purchase_order", "demo-po-PO-2026-0088.pdf",
         purchase_order_pdf(), "application/pdf"),
        (industrial, "industrial", "gst_certificate", "demo-gst-certificate.pdf",
         gst_certificate_pdf(), "application/pdf"),
        (public_user, "public", "offer_letter", "demo-offer-letter.pdf",
         offer_letter_pdf(), "application/pdf"),
    ]
    for owner, portal, kind, filename, payload, mime in plan:
        existing = _existing_document(owner, filename)
        if existing and existing.status == DOC_STATUS_ANALYSED:
            continue
        document = existing or _upload(owner, portal, kind, filename, payload, mime)
        result = run_analysis(document)
        created.append(
            f"{filename}: {result['risk']['category']} "
            f"({result['risk']['score']:.1f}/100), {result['counts']['failed']} failed check(s), "
            f"{result['alerts_created']} alert(s)"
        )
    return created


def seed(with_documents: bool = False) -> str:
    db.create_all()
    lines = []

    sunrise, org_created = _organisation(
        "Sunrise Manufacturing Pvt Ltd",
        org_type="Manufacturing",
        gstin=BUYER["gstin"],
        pan="AAKCS1234K",
        address=BUYER["address"],
        phone="9845098450",
        email="ops@sunrise.example",
        website="https://sunrise.example",
    )
    lines.append(f"Organisation: {sunrise.name} ({'created' if org_created else 'existing'})")

    admin, admin_created = _user(ADMIN_EMAIL, "Kavacha Administrator", ROLE_ADMIN, retention_days=30)
    industrial, industrial_created = _user(
        INDUSTRIAL_EMAIL, "Ananya Rao", ROLE_INDUSTRIAL, organisation=sunrise,
        phone="9845098450", retention_days=90,
    )
    public_user, public_created = _user(
        PUBLIC_EMAIL, "Priya Sharma", ROLE_PUBLIC, phone="9876543210", retention_days=7,
    )
    for user, created in ((admin, admin_created), (industrial, industrial_created), (public_user, public_created)):
        lines.append(f"User: {user.email} ({user.role}) — {'created' if created else 'existing'}")

    if org_created or industrial_created:
        supplier, supplier_created = _supplier(
            sunrise,
            VENDOR["name"],
            gstin=VENDOR["gstin"],
            pan=VENDOR["pan"],
            bank_account=VENDOR["account"],
            ifsc=VENDOR["ifsc"],
            email=VENDOR["email"],
            phone=VENDOR["phone"],
            address=VENDOR["address"],
        )
        lines.append(f"Supplier: {supplier.name} ({'created' if supplier_created else 'existing'})")
        _, other_created = _supplier(
            sunrise,
            "Nova Metals Traders",
            email="sales@novametals.example",
            phone="9900112233",
            address="Plot 7, Hosur Road, Bengaluru 560068",
        )
        if other_created:
            lines.append("Supplier: Nova Metals Traders (created)")

    if with_documents:
        for line in _demo_documents(industrial, public_user):
            lines.append(f"Document: {line}")
    else:
        lines.append("Documents: not generated (rerun with --with-documents).")

    lines.append("")
    lines.append("Demo sign-in (password for all accounts: " + DEMO_PASSWORD + ")")
    lines.append(f"  admin      {ADMIN_EMAIL}")
    lines.append(f"  industrial {INDUSTRIAL_EMAIL}")
    lines.append(f"  public     {PUBLIC_EMAIL}")
    lines.append(f"Seed completed at {utcnow():%Y-%m-%d %H:%M UTC}.")
    return "\n".join(lines)
