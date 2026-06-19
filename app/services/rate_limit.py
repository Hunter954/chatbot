from datetime import timedelta

from app.models import Message, utcnow


def too_many_messages(tenant_id: str, contact_id: str, limit_per_minute: int) -> bool:
    if limit_per_minute <= 0:
        return False
    since = utcnow() - timedelta(minutes=1)
    count = Message.query.filter(
        Message.tenant_id == tenant_id,
        Message.contact_id == contact_id,
        Message.direction == "inbound",
        Message.created_at >= since,
    ).count()
    return count > limit_per_minute
