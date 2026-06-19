from datetime import date, datetime
from typing import Any


def iso(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def model_to_dict(obj, fields: list[str]) -> dict:
    return {field: iso(getattr(obj, field)) for field in fields}


def tenant_dict(obj) -> dict:
    return model_to_dict(obj, ["id", "name", "slug", "segment", "timezone", "is_active", "settings", "created_at", "updated_at"])


def channel_dict(obj) -> dict:
    data = model_to_dict(obj, ["id", "tenant_id", "provider", "name", "session_id", "base_url", "is_active", "created_at", "updated_at"])
    data["api_key_configured"] = bool(getattr(obj, "api_key", ""))
    data["metadata"] = getattr(obj, "extra", {}) or {}
    return data


def contact_dict(obj) -> dict:
    return model_to_dict(obj, ["id", "tenant_id", "wa_id", "phone", "name", "tags", "attributes", "opted_out", "last_seen_at", "created_at", "updated_at"])


def conversation_dict(obj) -> dict:
    data = model_to_dict(obj, ["id", "tenant_id", "contact_id", "channel_id", "status", "bot_paused", "priority", "last_message_at", "context", "created_at", "updated_at"])
    if getattr(obj, "contact", None):
        data["contact"] = {"id": obj.contact.id, "name": obj.contact.name, "wa_id": obj.contact.wa_id, "phone": obj.contact.phone}
    return data


def message_dict(obj) -> dict:
    return model_to_dict(obj, ["id", "tenant_id", "conversation_id", "contact_id", "provider_message_id", "direction", "message_type", "body", "media_url", "status", "created_at"])


def faq_dict(obj) -> dict:
    return model_to_dict(obj, ["id", "tenant_id", "question", "answer", "keywords", "is_active", "sort_order", "created_at", "updated_at"])


def product_dict(obj) -> dict:
    data = model_to_dict(obj, ["id", "tenant_id", "name", "description", "category", "price_cents", "currency", "is_active", "created_at", "updated_at"])
    data["metadata"] = getattr(obj, "extra", {}) or {}
    return data


def booking_dict(obj) -> dict:
    data = model_to_dict(obj, ["id", "tenant_id", "contact_id", "conversation_id", "service_name", "scheduled_for", "status", "notes", "created_at", "updated_at"])
    data["metadata"] = getattr(obj, "extra", {}) or {}
    return data


def ticket_dict(obj) -> dict:
    return model_to_dict(obj, ["id", "tenant_id", "conversation_id", "contact_id", "subject", "status", "priority", "assigned_to", "notes", "created_at", "updated_at"])


def campaign_dict(obj) -> dict:
    return model_to_dict(obj, ["id", "tenant_id", "name", "body", "status", "filters", "stats", "created_at", "updated_at"])
