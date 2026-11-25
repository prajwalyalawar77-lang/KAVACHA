"""Blueprint registry."""

from app.routes import (
    admin, auth, dashboard, documents, fraud, industrial, meta, notifications,
    organisations, public_safety, reports, risk, verification,
)

BLUEPRINTS = (
    auth.bp,
    organisations.bp,
    documents.bp,
    verification.bp,
    fraud.bp,
    industrial.bp,
    public_safety.bp,
    risk.bp,
    reports.bp,
    admin.bp,
    notifications.bp,
    dashboard.bp,
    meta.bp,
)


def register_blueprints(app) -> None:
    for blueprint in BLUEPRINTS:
        app.register_blueprint(blueprint)
