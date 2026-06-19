from flask import Blueprint, jsonify, request

from app.services.bot_engine import process_webhook
from app.services.security import verify_webhook_secret

webhook_bp = Blueprint("webhooks", __name__)


@webhook_bp.post("/webhooks/openwa")
def openwa_webhook():
    if not verify_webhook_secret():
        return jsonify({"ok": False, "error": "invalid_webhook_secret"}), 401

    payload = request.get_json(silent=True) or {}
    result = process_webhook(payload)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status
