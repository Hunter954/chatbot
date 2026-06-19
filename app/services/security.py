from functools import wraps

from flask import current_app, jsonify, request


def require_admin_token(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        expected = current_app.config.get("ADMIN_API_TOKEN")
        provided = request.headers.get("X-Admin-Token") or request.args.get("admin_token")
        if not expected or expected == "change-me":
            return jsonify({"ok": False, "error": "admin_token_not_configured"}), 500
        if provided != expected:
            return jsonify({"ok": False, "error": "unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper


def verify_webhook_secret() -> bool:
    expected = current_app.config.get("OPENWA_WEBHOOK_SECRET")
    if not expected or expected == "change-me":
        return False
    provided = (
        request.headers.get("X-Webhook-Secret")
        or request.headers.get("X-OpenWA-Webhook-Secret")
        or request.args.get("token")
        or request.args.get("secret")
    )
    return provided == expected
