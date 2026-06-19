from flask import Blueprint, current_app, jsonify, request

from app.services.bot_engine import process_webhook
from app.services.security import verify_webhook_secret

webhook_bp = Blueprint("webhooks", __name__)


@webhook_bp.get("/webhooks/openwa/ping")
def openwa_webhook_ping():
    """Small public ping to validate the Flask webhook URL path."""
    return jsonify({"ok": True, "service": "flask-webhook", "path": "/webhooks/openwa"})


@webhook_bp.post("/webhooks/openwa")
def openwa_webhook():
    if not verify_webhook_secret():
        current_app.logger.warning(
            "OpenWA webhook rejected: invalid secret. remote=%s content_type=%s",
            request.remote_addr,
            request.content_type,
        )
        return jsonify({"ok": False, "error": "invalid_webhook_secret"}), 401

    payload = request.get_json(silent=True) or {}
    current_app.logger.info(
        "OpenWA webhook received. event=%s engine=%s payload_keys=%s",
        payload.get("event"),
        payload.get("engine"),
        sorted(list(payload.keys()))[:20],
    )
    result = process_webhook(payload)
    status = 200 if result.get("ok") else 400
    if not result.get("ok"):
        current_app.logger.warning("OpenWA webhook processing failed: %s", result)
    return jsonify(result), status
