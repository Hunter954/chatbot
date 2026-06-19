from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from flask import current_app

from app.extensions import db
from app.models import (
    Booking,
    Channel,
    Contact,
    Conversation,
    Message,
    OutboxMessage,
    SupportTicket,
    Tenant,
    utcnow,
)
from app.services.ai import generate_ai_reply
from app.services.analytics import track
from app.services.intent import classify
from app.services.kb import find_best_faq, product_catalog_text
from app.services.openwa import OpenWAClient
from app.services.rate_limit import too_many_messages
from app.services.webhook_parser import IncomingWhatsAppMessage, parse_openwa_payload


DEFAULT_MENU = """👋 Olá! Eu sou o assistente virtual.

Escolha uma opção:
*1* — Serviços e preços
*2* — Horários e localização
*3* — Agendar ou reservar
*4* — Abrir suporte
*5* — Falar com atendente
*0* — Encerrar

Você também pode escrever sua dúvida em uma frase."""


def _tenant_prompt(tenant: Tenant) -> str:
    settings = tenant.settings or {}
    business_name = settings.get("business_name") or tenant.name
    tone = settings.get("tone", "prestativo, direto e educado")
    return (
        f"Você é o atendente virtual de {business_name}. "
        f"Responda em português do Brasil, com tom {tone}. "
        "Se não souber a resposta, convide a pessoa a falar com um atendente humano. "
        "Nunca invente preço, estoque, prazo ou política fora dos dados fornecidos."
    )


def get_default_tenant() -> Tenant | None:
    slug = current_app.config.get("DEFAULT_TENANT_SLUG", "lanhouse-demo")
    return Tenant.query.filter_by(slug=slug, is_active=True).first()


def get_active_channel(tenant: Tenant) -> Channel | None:
    return Channel.query.filter_by(tenant_id=tenant.id, provider="openwa", is_active=True).order_by(Channel.created_at.asc()).first()


def _extract_phone(wa_id: str) -> str:
    before_at = (wa_id or "").split("@")[0]
    digits = "".join(ch for ch in before_at if ch.isdigit())
    return f"+{digits}" if digits else ""


def upsert_contact(tenant: Tenant, incoming: IncomingWhatsAppMessage) -> Contact:
    wa_id = incoming.from_id or incoming.chat_id
    contact = Contact.query.filter_by(tenant_id=tenant.id, wa_id=wa_id).first()
    if not contact:
        contact = Contact(
            tenant_id=tenant.id,
            wa_id=wa_id,
            phone=_extract_phone(wa_id),
            name=incoming.sender_name or "Cliente",
            last_seen_at=utcnow(),
        )
        db.session.add(contact)
    else:
        if incoming.sender_name and not contact.name:
            contact.name = incoming.sender_name
        contact.last_seen_at = utcnow()
    return contact


def get_or_create_conversation(tenant: Tenant, contact: Contact, channel: Channel | None) -> Conversation:
    conversation = (
        Conversation.query.filter(
            Conversation.tenant_id == tenant.id,
            Conversation.contact_id == contact.id,
            Conversation.status.in_(["open", "pending_human"]),
        )
        .order_by(Conversation.updated_at.desc())
        .first()
    )
    if not conversation:
        conversation = Conversation(
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel_id=channel.id if channel else None,
            status="open",
            last_message_at=utcnow(),
        )
        db.session.add(conversation)
    else:
        conversation.last_message_at = utcnow()
    return conversation


def store_inbound(tenant: Tenant, contact: Contact, conversation: Conversation, incoming: IncomingWhatsAppMessage) -> Message:
    message = Message(
        tenant_id=tenant.id,
        conversation_id=conversation.id,
        contact_id=contact.id,
        provider_message_id=incoming.provider_message_id,
        direction="inbound",
        message_type=incoming.message_type,
        body=incoming.body,
        media_url=incoming.media_url,
        raw_payload=incoming.raw,
        status="received",
    )
    db.session.add(message)
    track(tenant.id, "message_inbound", contact.id, conversation.id, message_type=incoming.message_type)
    return message


def send_bot_reply(tenant: Tenant, contact: Contact, conversation: Conversation, text: str) -> dict[str, Any]:
    channel = get_active_channel(tenant)
    client = OpenWAClient(
        base_url=(channel.base_url if channel and channel.base_url else ""),
        api_key=(channel.api_key if channel and channel.api_key else ""),
    )
    outbox = OutboxMessage(
        tenant_id=tenant.id,
        contact_id=contact.id,
        channel_id=channel.id if channel else None,
        to_wa_id=contact.wa_id,
        body=text,
        status="queued",
    )
    db.session.add(outbox)
    db.session.flush()

    result = client.send_text(contact.wa_id, text)
    outbox.status = "sent" if result.ok else "failed"
    outbox.provider_response = result.data if isinstance(result.data, dict) else {"raw": str(result.data)}
    outbox.error = result.error or ""
    if result.ok:
        outbox.sent_at = utcnow()

    outbound = Message(
        tenant_id=tenant.id,
        conversation_id=conversation.id,
        contact_id=contact.id,
        provider_message_id=str(result.data)[:255] if result.ok and result.data else None,
        direction="outbound",
        message_type="text",
        body=text,
        raw_payload={"openwa_result": outbox.provider_response, "error": outbox.error},
        status=outbox.status,
    )
    db.session.add(outbound)
    conversation.last_message_at = utcnow()
    track(tenant.id, "message_outbound", contact.id, conversation.id, ok=result.ok)
    return {"sent": result.ok, "error": result.error, "outbox_id": outbox.id}


def create_ticket(tenant: Tenant, contact: Contact, conversation: Conversation, subject: str, notes: str = "", priority: str = "normal") -> SupportTicket:
    ticket = SupportTicket(
        tenant_id=tenant.id,
        contact_id=contact.id,
        conversation_id=conversation.id,
        subject=subject[:180],
        notes=notes,
        priority=priority,
        status="open",
    )
    conversation.status = "pending_human"
    conversation.bot_paused = True
    db.session.add(ticket)
    track(tenant.id, "ticket_opened", contact.id, conversation.id, ticket_id=ticket.id, subject=subject)
    return ticket


def _reply_hours_location(tenant: Tenant) -> str:
    settings = tenant.settings or {}
    hours = settings.get("business_hours", "Horário ainda não configurado.")
    address = settings.get("address", "Endereço ainda não configurado.")
    maps_url = settings.get("maps_url", "")
    parts = ["🕒 *Horários e localização*", "", f"Horário: {hours}", f"Endereço: {address}"]
    if maps_url:
        parts.append(f"Mapa: {maps_url}")
    parts.append("\nDigite *menu* para ver as opções.")
    return "\n".join(parts)


def _start_booking(tenant: Tenant, contact: Contact, conversation: Conversation) -> str:
    conversation.context = {**(conversation.context or {}), "awaiting": "booking_details"}
    track(tenant.id, "booking_started", contact.id, conversation.id)
    segment_hint = "computador/serviço desejado" if tenant.segment == "lan_house" else "serviço desejado"
    return (
        "📅 Perfeito. Para eu registrar a solicitação, envie em uma mensagem:\n"
        f"• {segment_hint}\n"
        "• dia e horário desejados\n"
        "• seu nome, se ainda não informou\n\n"
        "Exemplo: `Reservar 1 PC hoje às 15h, nome Alexandre`."
    )


def _finish_booking(tenant: Tenant, contact: Contact, conversation: Conversation, text: str) -> str:
    booking = Booking(
        tenant_id=tenant.id,
        contact_id=contact.id,
        conversation_id=conversation.id,
        service_name="Solicitação via WhatsApp",
        scheduled_for=None,
        status="requested",
        notes=text,
        extra={"source": "bot", "raw_request": text},
    )
    db.session.add(booking)
    conversation.context = {**(conversation.context or {}), "awaiting": None, "last_booking_id": booking.id}
    track(tenant.id, "booking_requested", contact.id, conversation.id, booking_id=booking.id)
    return (
        f"✅ Solicitação registrada! Protocolo: *{booking.id[:8]}*.\n"
        "Um atendente vai confirmar a disponibilidade.\n\n"
        "Digite *menu* para ver outras opções ou *5* para falar com atendente."
    )


def _unknown_reply(tenant: Tenant, text: str, conversation: Conversation) -> str:
    faq, score = find_best_faq(tenant.id, text)
    if faq:
        track(tenant.id, "faq_matched", conversation.contact_id, conversation.id, faq_id=faq.id, score=score)
        return f"{faq.answer}\n\nDigite *menu* para ver as opções."

    recent = (
        Message.query.filter_by(conversation_id=conversation.id)
        .order_by(Message.created_at.desc())
        .limit(6)
        .all()
    )
    context = []
    for msg in reversed(recent):
        context.append({"role": "assistant" if msg.direction == "outbound" else "user", "content": msg.body})
    ai_reply = generate_ai_reply(_tenant_prompt(tenant), text, context=context)
    if ai_reply:
        track(tenant.id, "ai_reply", conversation.contact_id, conversation.id)
        return ai_reply

    track(tenant.id, "fallback_menu", conversation.contact_id, conversation.id)
    return (
        "Não entendi totalmente sua mensagem, mas posso ajudar por aqui. 😊\n\n"
        + DEFAULT_MENU
    )


def build_reply(tenant: Tenant, contact: Contact, conversation: Conversation, incoming: IncomingWhatsAppMessage) -> str | None:
    text = incoming.body.strip()
    settings = tenant.settings or {}
    menu = settings.get("main_menu") or DEFAULT_MENU

    if not text and incoming.message_type != "text":
        return "Recebi seu arquivo/mídia. Para esse MVP, um atendente vai analisar e te responder. Digite *menu* para outras opções."

    if conversation.context and conversation.context.get("awaiting") == "booking_details":
        if classify(text).name == "cancel":
            conversation.context = {**(conversation.context or {}), "awaiting": None}
            return "Tudo bem, cancelei essa etapa.\n\n" + menu
        return _finish_booking(tenant, contact, conversation, text)

    intent = classify(text)
    track(tenant.id, "intent_detected", contact.id, conversation.id, intent=intent.name, confidence=intent.confidence)

    if intent.name == "optout":
        contact.opted_out = True
        return "Combinado. Você foi removido da lista de mensagens ativas. Para atendimento, envie *menu*."

    if intent.name == "greeting":
        return menu
    if intent.name == "prices":
        return product_catalog_text(tenant.id)
    if intent.name == "hours_location":
        return _reply_hours_location(tenant)
    if intent.name == "booking":
        return _start_booking(tenant, contact, conversation)
    if intent.name == "support":
        create_ticket(tenant, contact, conversation, "Suporte via WhatsApp", notes=text, priority="normal")
        return (
            "🛠️ Abri um chamado para você. Um atendente vai continuar o atendimento por aqui.\n"
            "Se quiser complementar, envie mais detalhes, prints ou número do equipamento."
        )
    if intent.name == "human":
        create_ticket(tenant, contact, conversation, "Atendimento humano solicitado", notes=text, priority="normal")
        return "Certo, vou chamar um atendente humano. A automação ficará pausada nesta conversa."
    if intent.name == "cancel":
        conversation.status = "closed"
        conversation.bot_paused = False
        track(tenant.id, "conversation_closed", contact.id, conversation.id)
        return "Atendimento encerrado. Quando precisar, envie *menu* para começar de novo."

    return _unknown_reply(tenant, text, conversation)


def process_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    tenant = get_default_tenant()
    if not tenant:
        return {"ok": False, "error": "tenant_not_found"}

    incoming = parse_openwa_payload(payload)
    if not incoming:
        return {"ok": False, "error": "invalid_payload"}

    if incoming.from_me:
        return {"ok": True, "ignored": "from_me"}
    if incoming.is_group and current_app.config.get("IGNORE_GROUP_MESSAGES", True):
        return {"ok": True, "ignored": "group_message"}

    channel = get_active_channel(tenant)
    contact = upsert_contact(tenant, incoming)
    conversation = get_or_create_conversation(tenant, contact, channel)
    store_inbound(tenant, contact, conversation, incoming)
    db.session.flush()

    if too_many_messages(tenant.id, contact.id, current_app.config.get("RATE_LIMIT_PER_MINUTE", 25)):
        track(tenant.id, "rate_limited", contact.id, conversation.id)
        db.session.commit()
        return {"ok": True, "ignored": "rate_limited"}

    if current_app.config.get("BOT_DISABLED", False):
        db.session.commit()
        return {"ok": True, "ignored": "bot_disabled"}

    if conversation.bot_paused:
        db.session.commit()
        return {"ok": True, "ignored": "conversation_paused"}

    reply = build_reply(tenant, contact, conversation, incoming)
    send_result = None
    if reply:
        send_result = send_bot_reply(tenant, contact, conversation, reply)

    db.session.commit()
    return {
        "ok": True,
        "tenant_id": tenant.id,
        "contact_id": contact.id,
        "conversation_id": conversation.id,
        "reply_sent": bool(reply),
        "send_result": send_result,
    }
