from flask import Blueprint, current_app, jsonify
from sqlalchemy import text

from app.extensions import db
from app.services.bot_engine import get_default_tenant
from app.services.openwa import OpenWAClient

public_bp = Blueprint("public", __name__)


@public_bp.get("/")
def index():
    tenant = get_default_tenant()
    return jsonify(
        {
            "ok": True,
            "service": "openwa-chatbot-mvp",
            "tenant": {"name": tenant.name, "slug": tenant.slug} if tenant else None,
            "docs": "/admin?token=SEU_ADMIN_API_TOKEN",
            "health": "/healthz",
        }
    )


@public_bp.get("/healthz")
def healthz():
    return jsonify({"ok": True})


@public_bp.get("/readyz")
def readyz():
    db_ok = False
    try:
        db.session.execute(text("select 1"))
        db_ok = True
    except Exception as exc:  # pragma: no cover
        current_app.logger.warning("DB readiness failed: %s", exc)

    openwa_configured = bool(current_app.config.get("OPENWA_BASE_URL"))
    return jsonify({"ok": db_ok, "database": db_ok, "openwa_configured": openwa_configured}), (200 if db_ok else 503)


@public_bp.get("/openwa/metrics")
def openwa_metrics():
    # This route intentionally does not expose admin-only data; it is useful for uptime probes.
    result = OpenWAClient().metrics()
    return jsonify({"ok": result.ok, "data": result.data, "error": result.error}), (200 if result.ok else 502)
