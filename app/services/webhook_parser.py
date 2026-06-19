from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class IncomingWhatsAppMessage:
    provider_message_id: str
    from_id: str
    chat_id: str
    sender_name: str
    body: str
    message_type: str
    timestamp: int | None
    is_group: bool
    from_me: bool
    media_url: str
    raw: dict[str, Any]


def _dig(data: dict, *keys, default=None):
    current: Any = data
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
    return current if current is not None else default


def parse_openwa_payload(payload: dict[str, Any]) -> IncomingWhatsAppMessage | None:
    """Accept common OpenWA webhook payload shapes.

    OpenWA may send either the message object directly or an event envelope with
    fields such as data/message/payload. This parser keeps the MVP tolerant.
    """
    if not isinstance(payload, dict):
        return None

    message = payload.get("data") or payload.get("message") or payload.get("payload") or payload
    if isinstance(message, list) and message:
        message = message[0]
    if not isinstance(message, dict):
        return None

    provider_id = str(message.get("id") or _dig(message, "id", "_serialized") or message.get("messageId") or "")
    chat_id = str(
        message.get("chatId")
        or message.get("from")
        or _dig(message, "chat", "id")
        or _dig(message, "chat", "id", "_serialized")
        or _dig(message, "sender", "id")
        or _dig(message, "sender", "id", "_serialized")
        or ""
    )
    from_id = str(
        message.get("from")
        or _dig(message, "sender", "id")
        or _dig(message, "sender", "id", "_serialized")
        or chat_id
    )
    sender_name = str(
        message.get("notifyName")
        or message.get("senderName")
        or _dig(message, "sender", "pushname")
        or _dig(message, "sender", "name")
        or ""
    )
    body = str(message.get("body") or message.get("caption") or message.get("text") or "").strip()
    message_type = str(message.get("type") or message.get("mimetype") or "text")
    timestamp = message.get("timestamp") or message.get("t")
    try:
        timestamp = int(timestamp) if timestamp else None
    except (TypeError, ValueError):
        timestamp = None

    is_group = bool(message.get("isGroupMsg") or message.get("isGroup") or chat_id.endswith("@g.us") or from_id.endswith("@g.us"))
    from_me = bool(message.get("fromMe") or message.get("isSentByMe"))
    media_url = str(message.get("mediaUrl") or message.get("fileUrl") or message.get("deprecatedMms3Url") or "")

    if not chat_id and not from_id:
        return None

    return IncomingWhatsAppMessage(
        provider_message_id=provider_id,
        from_id=from_id,
        chat_id=chat_id or from_id,
        sender_name=sender_name,
        body=body,
        message_type=message_type,
        timestamp=timestamp,
        is_group=is_group,
        from_me=from_me,
        media_url=media_url,
        raw=payload,
    )
