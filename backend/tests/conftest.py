"""Shared pytest fixtures for the KAVACHA API test suite."""

from __future__ import annotations

import io

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app import create_app
from app.config import TestConfig
from app.extensions import db


def make_pdf(lines: list[str], title: str = "TEST DOCUMENT") -> bytes:
    """Render a text-layer PDF so OCR/parsing has deterministic input."""
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(72, 780, title)
    pdf.setFont("Helvetica", 11)
    y = 750
    for line in lines:
        pdf.drawString(72, y, line)
        y -= 20
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


@pytest.fixture()
def app():
    application = create_app(TestConfig)
    with application.app_context():
        db.drop_all()
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    from app.utils.limiter import reset_limits

    reset_limits()
    yield
    reset_limits()


@pytest.fixture()
def client(app):
    return app.test_client()


def register_user(client, email: str, role: str = "public", password: str = "Passw0rd123"):
    payload = {"full_name": email.split("@")[0].title(), "email": email, "password": password, "role": role}
    if role == "industrial":
        payload["organisation"] = {"name": f"{payload['full_name']} Industries", "org_type": "Manufacturing"}
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.get_json()
    token = response.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}, response.get_json()["data"]["user"]


def upload_document(client, headers, lines, doc_kind="invoice", portal="public", filename="test.pdf", auto_analyse=True):
    data = {
        "portal": portal,
        "doc_kind": doc_kind,
        "auto_analyse": "true" if auto_analyse else "false",
        "file": (io.BytesIO(make_pdf(lines)), filename),
        "language": "eng",
    }
    response = client.post("/api/documents", data=data, content_type="multipart/form-data", headers=headers)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


@pytest.fixture()
def public_user(client):
    return register_user(client, "citizen@example.com", "public")


@pytest.fixture()
def industrial_user(client):
    return register_user(client, "ops@example.com", "industrial")


@pytest.fixture()
def admin_headers(app, client):
    from app.models import User

    user = User(email="root@example.com", full_name="Root Admin", role="admin")
    user.set_password("Passw0rd123")
    db.session.add(user)
    db.session.commit()
    response = client.post("/api/auth/login", json={"email": "root@example.com", "password": "Passw0rd123"})
    assert response.status_code == 200, response.get_json()
    return {"Authorization": f"Bearer {response.get_json()['data']['token']}"}
