from datetime import datetime

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import (
    Booking,
    Campaign,
    Channel,
    Contact,
    Conversation,
    FAQEntry,
    Message,
    OutboxMessage,
    AnalyticsEvent,
    Product,
    SupportTicket,
    Tenant,
    utcnow,
)
from app.services.analytics import tenant_summary, track
from app.services.bot_engine import get_active_channel, get_default_tenant, send_bot_reply
from app.services.openwa import normalize_whatsapp_id
from app.services.security import require_admin_token
from app.services.serializers import (
    booking_dict,
    campaign_dict,
    channel_dict,
    contact_dict,
    conversation_dict,
    faq_dict,
    message_dict,
    product_dict,
    tenant_dict,
    ticket_dict,
)

admin_bp = Blueprint("admin", __name__)


def _tenant_or_404(slug_or_id: str | None = None):
    tenant = None
    if slug_or_id:
        tenant = Tenant.query.filter((Tenant.slug == slug_or_id) | (Tenant.id == slug_or_id)).first()
    else:
        tenant = get_default_tenant()
    if not tenant:
        return None, (jsonify({"ok": False, "error": "tenant_not_found"}), 404)
    return tenant, None


def _payload():
    return request.get_json(silent=True) or {}


@admin_bp.get('/debug/webhook')
@require_admin_token
def debug_webhook():
    tenant, error = _tenant_or_404(request.args.get('tenant'))
    if error:
        return error

    recent_messages = (
        Message.query.filter_by(tenant_id=tenant.id)
        .order_by(Message.created_at.desc())
        .limit(20)
        .all()
    )
    recent_contacts = (
        Contact.query.filter_by(tenant_id=tenant.id)
        .order_by(Contact.updated_at.desc())
        .limit(20)
        .all()
    )
    recent_outbox = (
        OutboxMessage.query.filter_by(tenant_id=tenant.id)
        .order_by(OutboxMessage.created_at.desc())
        .limit(10)
        .all()
    )
    recent_events = (
        AnalyticsEvent.query.filter_by(tenant_id=tenant.id)
        .order_by(AnalyticsEvent.created_at.desc())
        .limit(20)
        .all()
    )
    channels = Channel.query.filter_by(tenant_id=tenant.id).order_by(Channel.created_at.desc()).all()

    return jsonify({
        'ok': True,
        'tenant': {'id': tenant.id, 'slug': tenant.slug, 'name': tenant.name},
        'counts': {
            'contacts': Contact.query.filter_by(tenant_id=tenant.id).count(),
            'conversations': Conversation.query.filter_by(tenant_id=tenant.id).count(),
            'messages': Message.query.filter_by(tenant_id=tenant.id).count(),
            'inbound_messages': Message.query.filter_by(tenant_id=tenant.id, direction='inbound').count(),
            'outbound_messages': Message.query.filter_by(tenant_id=tenant.id, direction='outbound').count(),
            'outbox': OutboxMessage.query.filter_by(tenant_id=tenant.id).count(),
        },
        'channels': [
            {
                'id': c.id,
                'provider': c.provider,
                'session_id': c.session_id,
                'base_url': c.base_url,
                'api_key_configured': bool(c.api_key),
                'is_active': c.is_active,
                'created_at': c.created_at.isoformat() if c.created_at else None,
            }
            for c in channels
        ],
        'recent_contacts': [
            {
                'id': c.id,
                'wa_id': c.wa_id,
                'phone': c.phone,
                'name': c.name,
                'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in recent_contacts
        ],
        'recent_messages': [
            {
                'id': m.id,
                'direction': m.direction,
                'contact_id': m.contact_id,
                'conversation_id': m.conversation_id,
                'provider_message_id': m.provider_message_id,
                'type': m.message_type,
                'body': m.body,
                'status': m.status,
                'created_at': m.created_at.isoformat() if m.created_at else None,
            }
            for m in recent_messages
        ],
        'recent_outbox': [
            {
                'id': o.id,
                'to_wa_id': o.to_wa_id,
                'status': o.status,
                'error': o.error,
                'body': o.body,
                'created_at': o.created_at.isoformat() if o.created_at else None,
            }
            for o in recent_outbox
        ],
        'recent_events': [
            {
                'id': e.id,
                'event_type': e.event_type,
                'contact_id': e.contact_id,
                'conversation_id': e.conversation_id,
                'data': e.data,
                'created_at': e.created_at.isoformat() if e.created_at else None,
            }
            for e in recent_events
        ],
    })


@admin_bp.get("/tenants")
@require_admin_token
def list_tenants():
    tenants = Tenant.query.order_by(Tenant.created_at.desc()).all()
    return jsonify({"ok": True, "items": [tenant_dict(t) for t in tenants]})


@admin_bp.post("/tenants")
@require_admin_token
def create_tenant():
    data = _payload()
    tenant = Tenant(
        name=data.get("name", "Novo estabelecimento"),
        slug=data.get("slug", "novo-estabelecimento"),
        segment=data.get("segment", "general"),
        timezone=data.get("timezone", "America/Sao_Paulo"),
        settings=data.get("settings") or {},
        is_active=bool(data.get("is_active", True)),
    )
    db.session.add(tenant)
    db.session.commit()
    return jsonify({"ok": True, "item": tenant_dict(tenant)}), 201


@admin_bp.get("/tenants/<tenant_ref>")
@require_admin_token
def get_tenant(tenant_ref):
    tenant, error = _tenant_or_404(tenant_ref)
    if error:
        return error
    return jsonify({"ok": True, "item": tenant_dict(tenant)})


@admin_bp.patch("/tenants/<tenant_ref>")
@require_admin_token
def update_tenant(tenant_ref):
    tenant, error = _tenant_or_404(tenant_ref)
    if error:
        return error
    data = _payload()
    for field in ["name", "segment", "timezone", "is_active"]:
        if field in data:
            setattr(tenant, field, data[field])
    if "settings" in data:
        tenant.settings = {**(tenant.settings or {}), **(data.get("settings") or {})}
    db.session.commit()
    return jsonify({"ok": True, "item": tenant_dict(tenant)})


@admin_bp.get("/channels")
@require_admin_token
def list_channels():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    channels = Channel.query.filter_by(tenant_id=tenant.id).order_by(Channel.created_at.desc()).all()
    return jsonify({"ok": True, "items": [channel_dict(c) for c in channels]})


@admin_bp.post("/channels")
@require_admin_token
def create_channel():
    data = _payload()
    tenant, error = _tenant_or_404(data.get("tenant") or data.get("tenant_id"))
    if error:
        return error
    channel = Channel(
        tenant_id=tenant.id,
        provider=data.get("provider", "openwa"),
        name=data.get("name", "WhatsApp"),
        session_id=data.get("session_id", "default"),
        base_url=data.get("base_url", ""),
        api_key=data.get("api_key", ""),
        is_active=bool(data.get("is_active", True)),
        extra=data.get("metadata") or {},
    )
    db.session.add(channel)
    db.session.commit()
    return jsonify({"ok": True, "item": channel_dict(channel)}), 201


@admin_bp.patch("/channels/<channel_id>")
@require_admin_token
def update_channel(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    data = _payload()
    for field in ["name", "session_id", "base_url", "api_key", "is_active"]:
        if field in data:
            setattr(channel, field, data[field])
    if "metadata" in data:
        channel.extra = {**(channel.extra or {}), **(data.get("metadata") or {})}
    db.session.commit()
    return jsonify({"ok": True, "item": channel_dict(channel)})


@admin_bp.get("/contacts")
@require_admin_token
def list_contacts():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    q = Contact.query.filter_by(tenant_id=tenant.id)
    search = request.args.get("q", "").strip()
    if search:
        like = f"%{search}%"
        q = q.filter((Contact.name.ilike(like)) | (Contact.phone.ilike(like)) | (Contact.wa_id.ilike(like)))
    contacts = q.order_by(Contact.updated_at.desc()).limit(int(request.args.get("limit", 100))).all()
    return jsonify({"ok": True, "items": [contact_dict(c) for c in contacts]})


@admin_bp.patch("/contacts/<contact_id>")
@require_admin_token
def update_contact(contact_id):
    contact = Contact.query.get_or_404(contact_id)
    data = _payload()
    for field in ["name", "phone", "opted_out"]:
        if field in data:
            setattr(contact, field, data[field])
    if "tags" in data:
        contact.tags = data.get("tags") or []
    if "attributes" in data:
        contact.attributes = {**(contact.attributes or {}), **(data.get("attributes") or {})}
    db.session.commit()
    return jsonify({"ok": True, "item": contact_dict(contact)})


@admin_bp.get("/conversations")
@require_admin_token
def list_conversations():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    status = request.args.get("status")
    q = Conversation.query.filter_by(tenant_id=tenant.id)
    if status:
        q = q.filter_by(status=status)
    conversations = q.order_by(Conversation.updated_at.desc()).limit(int(request.args.get("limit", 100))).all()
    return jsonify({"ok": True, "items": [conversation_dict(c) for c in conversations]})


@admin_bp.get("/conversations/<conversation_id>")
@require_admin_token
def get_conversation(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    messages = Message.query.filter_by(conversation_id=conversation.id).order_by(Message.created_at.asc()).limit(300).all()
    return jsonify(
        {
            "ok": True,
            "item": conversation_dict(conversation),
            "messages": [message_dict(m) for m in messages],
        }
    )


@admin_bp.post("/conversations/<conversation_id>/reply")
@require_admin_token
def reply_conversation(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    data = _payload()
    text = data.get("body", "").strip()
    if not text:
        return jsonify({"ok": False, "error": "body_required"}), 400
    tenant = Tenant.query.get_or_404(conversation.tenant_id)
    contact = Contact.query.get_or_404(conversation.contact_id)
    result = send_bot_reply(tenant, contact, conversation, text)
    db.session.commit()
    return jsonify({"ok": True, "send_result": result})


@admin_bp.post("/conversations/<conversation_id>/handoff")
@require_admin_token
def pause_conversation(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    conversation.bot_paused = True
    conversation.status = "pending_human"
    track(conversation.tenant_id, "handoff_enabled", conversation.contact_id, conversation.id)
    db.session.commit()
    return jsonify({"ok": True, "item": conversation_dict(conversation)})


@admin_bp.post("/conversations/<conversation_id>/resume")
@require_admin_token
def resume_conversation(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    conversation.bot_paused = False
    conversation.status = "open"
    track(conversation.tenant_id, "bot_resumed", conversation.contact_id, conversation.id)
    db.session.commit()
    return jsonify({"ok": True, "item": conversation_dict(conversation)})


@admin_bp.post("/messages/send")
@require_admin_token
def send_message():
    data = _payload()
    tenant, error = _tenant_or_404(data.get("tenant") or data.get("tenant_id"))
    if error:
        return error
    to_wa_id = normalize_whatsapp_id(data.get("to") or data.get("wa_id") or "")
    body = data.get("body", "").strip()
    if not to_wa_id or not body:
        return jsonify({"ok": False, "error": "to_and_body_required"}), 400
    incoming_stub = type("Incoming", (), {"from_id": to_wa_id, "chat_id": to_wa_id, "sender_name": "", "body": "", "message_type": "text", "media_url": "", "provider_message_id": "", "raw": {}})()
    contact = Contact.query.filter_by(tenant_id=tenant.id, wa_id=to_wa_id).first()
    if not contact:
        contact = Contact(tenant_id=tenant.id, wa_id=to_wa_id, phone=to_wa_id.split("@")[0], name=data.get("name", "Cliente"))
        db.session.add(contact)
        db.session.flush()
    channel = get_active_channel(tenant)
    conversation = Conversation.query.filter_by(tenant_id=tenant.id, contact_id=contact.id, status="open").first()
    if not conversation:
        conversation = Conversation(tenant_id=tenant.id, contact_id=contact.id, channel_id=channel.id if channel else None, status="open")
        db.session.add(conversation)
        db.session.flush()
    result = send_bot_reply(tenant, contact, conversation, body)
    db.session.commit()
    return jsonify({"ok": True, "send_result": result})


@admin_bp.get("/faqs")
@require_admin_token
def list_faqs():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    items = FAQEntry.query.filter_by(tenant_id=tenant.id).order_by(FAQEntry.sort_order.asc(), FAQEntry.created_at.desc()).all()
    return jsonify({"ok": True, "items": [faq_dict(item) for item in items]})


@admin_bp.post("/faqs")
@require_admin_token
def create_faq():
    data = _payload()
    tenant, error = _tenant_or_404(data.get("tenant") or data.get("tenant_id"))
    if error:
        return error
    item = FAQEntry(
        tenant_id=tenant.id,
        question=data.get("question", ""),
        answer=data.get("answer", ""),
        keywords=data.get("keywords") or [],
        is_active=bool(data.get("is_active", True)),
        sort_order=int(data.get("sort_order", 0)),
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"ok": True, "item": faq_dict(item)}), 201


@admin_bp.patch("/faqs/<item_id>")
@require_admin_token
def update_faq(item_id):
    item = FAQEntry.query.get_or_404(item_id)
    data = _payload()
    for field in ["question", "answer", "keywords", "is_active", "sort_order"]:
        if field in data:
            setattr(item, field, data[field])
    db.session.commit()
    return jsonify({"ok": True, "item": faq_dict(item)})


@admin_bp.delete("/faqs/<item_id>")
@require_admin_token
def delete_faq(item_id):
    item = FAQEntry.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.get("/products")
@require_admin_token
def list_products():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    items = Product.query.filter_by(tenant_id=tenant.id).order_by(Product.category.asc(), Product.name.asc()).all()
    return jsonify({"ok": True, "items": [product_dict(item) for item in items]})


@admin_bp.post("/products")
@require_admin_token
def create_product():
    data = _payload()
    tenant, error = _tenant_or_404(data.get("tenant") or data.get("tenant_id"))
    if error:
        return error
    item = Product(
        tenant_id=tenant.id,
        name=data.get("name", "Produto"),
        description=data.get("description", ""),
        category=data.get("category", "geral"),
        price_cents=int(data.get("price_cents", 0)),
        currency=data.get("currency", "BRL"),
        is_active=bool(data.get("is_active", True)),
        extra=data.get("metadata") or {},
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"ok": True, "item": product_dict(item)}), 201


@admin_bp.patch("/products/<item_id>")
@require_admin_token
def update_product(item_id):
    item = Product.query.get_or_404(item_id)
    data = _payload()
    for field in ["name", "description", "category", "price_cents", "currency", "is_active"]:
        if field in data:
            setattr(item, field, data[field])
    if "metadata" in data:
        item.extra = {**(item.extra or {}), **(data.get("metadata") or {})}
    db.session.commit()
    return jsonify({"ok": True, "item": product_dict(item)})


@admin_bp.delete("/products/<item_id>")
@require_admin_token
def delete_product(item_id):
    item = Product.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.get("/bookings")
@require_admin_token
def list_bookings():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    status = request.args.get("status")
    q = Booking.query.filter_by(tenant_id=tenant.id)
    if status:
        q = q.filter_by(status=status)
    items = q.order_by(Booking.created_at.desc()).limit(100).all()
    return jsonify({"ok": True, "items": [booking_dict(item) for item in items]})


@admin_bp.patch("/bookings/<item_id>")
@require_admin_token
def update_booking(item_id):
    item = Booking.query.get_or_404(item_id)
    data = _payload()
    for field in ["service_name", "status", "notes"]:
        if field in data:
            setattr(item, field, data[field])
    if "metadata" in data:
        item.extra = {**(item.extra or {}), **(data.get("metadata") or {})}
    if data.get("scheduled_for"):
        item.scheduled_for = datetime.fromisoformat(data["scheduled_for"].replace("Z", "+00:00"))
    db.session.commit()
    return jsonify({"ok": True, "item": booking_dict(item)})


@admin_bp.get("/tickets")
@require_admin_token
def list_tickets():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    status = request.args.get("status")
    q = SupportTicket.query.filter_by(tenant_id=tenant.id)
    if status:
        q = q.filter_by(status=status)
    items = q.order_by(SupportTicket.updated_at.desc()).limit(100).all()
    return jsonify({"ok": True, "items": [ticket_dict(item) for item in items]})


@admin_bp.patch("/tickets/<item_id>")
@require_admin_token
def update_ticket(item_id):
    item = SupportTicket.query.get_or_404(item_id)
    data = _payload()
    for field in ["subject", "status", "priority", "assigned_to", "notes"]:
        if field in data:
            setattr(item, field, data[field])
    if item.status in {"closed", "resolved"} and item.conversation:
        item.conversation.status = "open"
        item.conversation.bot_paused = False
    db.session.commit()
    return jsonify({"ok": True, "item": ticket_dict(item)})


@admin_bp.get("/campaigns")
@require_admin_token
def list_campaigns():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    items = Campaign.query.filter_by(tenant_id=tenant.id).order_by(Campaign.created_at.desc()).all()
    return jsonify({"ok": True, "items": [campaign_dict(item) for item in items]})


@admin_bp.post("/campaigns")
@require_admin_token
def create_campaign():
    data = _payload()
    tenant, error = _tenant_or_404(data.get("tenant") or data.get("tenant_id"))
    if error:
        return error
    item = Campaign(
        tenant_id=tenant.id,
        name=data.get("name", "Campanha"),
        body=data.get("body", ""),
        filters=data.get("filters") or {},
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"ok": True, "item": campaign_dict(item)}), 201


@admin_bp.post("/campaigns/<campaign_id>/dispatch")
@require_admin_token
def dispatch_campaign(campaign_id):
    campaign = Campaign.query.get_or_404(campaign_id)
    tenant = Tenant.query.get_or_404(campaign.tenant_id)
    filters = campaign.filters or {}
    q = Contact.query.filter_by(tenant_id=tenant.id, opted_out=False)
    tag = filters.get("tag")
    limit = int(filters.get("limit", 25))
    contacts = q.order_by(Contact.updated_at.desc()).limit(limit).all()
    if tag:
        contacts = [contact for contact in contacts if tag in (contact.tags or [])]
    sent = 0
    failed = 0
    for contact in contacts:
        conversation = Conversation.query.filter_by(tenant_id=tenant.id, contact_id=contact.id, status="open").first()
        if not conversation:
            conversation = Conversation(tenant_id=tenant.id, contact_id=contact.id, channel_id=(get_active_channel(tenant).id if get_active_channel(tenant) else None), status="open")
            db.session.add(conversation)
            db.session.flush()
        result = send_bot_reply(tenant, contact, conversation, campaign.body)
        sent += 1 if result.get("sent") else 0
        failed += 0 if result.get("sent") else 1
    campaign.status = "sent"
    campaign.stats = {"sent": sent, "failed": failed, "dispatched_at": utcnow().isoformat()}
    db.session.commit()
    return jsonify({"ok": True, "item": campaign_dict(campaign)})


@admin_bp.get("/analytics/summary")
@require_admin_token
def analytics_summary():
    tenant, error = _tenant_or_404(request.args.get("tenant"))
    if error:
        return error
    return jsonify({"ok": True, "summary": tenant_summary(tenant.id)})
