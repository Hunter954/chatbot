from sqlalchemy import func

from app.extensions import db
from app.models import AnalyticsEvent, Conversation, Message, SupportTicket


def track(tenant_id: str, event_type: str, contact_id: str | None = None, conversation_id: str | None = None, **data):
    event = AnalyticsEvent(
        tenant_id=tenant_id,
        event_type=event_type,
        contact_id=contact_id,
        conversation_id=conversation_id,
        data=data,
    )
    db.session.add(event)
    return event


def tenant_summary(tenant_id: str) -> dict:
    inbound = db.session.query(func.count(Message.id)).filter_by(tenant_id=tenant_id, direction="inbound").scalar() or 0
    outbound = db.session.query(func.count(Message.id)).filter_by(tenant_id=tenant_id, direction="outbound").scalar() or 0
    open_conversations = db.session.query(func.count(Conversation.id)).filter(
        Conversation.tenant_id == tenant_id,
        Conversation.status.in_(["open", "pending_human"]),
    ).scalar() or 0
    tickets_open = db.session.query(func.count(SupportTicket.id)).filter_by(tenant_id=tenant_id, status="open").scalar() or 0
    top_events = (
        db.session.query(AnalyticsEvent.event_type, func.count(AnalyticsEvent.id))
        .filter_by(tenant_id=tenant_id)
        .group_by(AnalyticsEvent.event_type)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .limit(8)
        .all()
    )
    return {
        "messages": {"inbound": inbound, "outbound": outbound},
        "open_conversations": open_conversations,
        "open_tickets": tickets_open,
        "events": [{"event_type": item[0], "count": item[1]} for item in top_events],
    }
