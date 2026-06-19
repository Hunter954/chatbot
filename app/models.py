import uuid
from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint

from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


def uuid_str():
    return str(uuid.uuid4())


class TimestampMixin:
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Tenant(TimestampMixin, db.Model):
    __tablename__ = "tenants"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    name = db.Column(db.String(160), nullable=False)
    slug = db.Column(db.String(80), unique=True, nullable=False, index=True)
    segment = db.Column(db.String(80), default="general", nullable=False)
    timezone = db.Column(db.String(80), default="America/Sao_Paulo", nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    settings = db.Column(db.JSON, default=dict, nullable=False)

    channels = db.relationship("Channel", back_populates="tenant", cascade="all, delete-orphan")
    contacts = db.relationship("Contact", back_populates="tenant", cascade="all, delete-orphan")


class Channel(TimestampMixin, db.Model):
    __tablename__ = "channels"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    provider = db.Column(db.String(40), default="openwa", nullable=False)
    name = db.Column(db.String(120), default="WhatsApp", nullable=False)
    session_id = db.Column(db.String(120), default="default", nullable=False)
    base_url = db.Column(db.String(255), default="", nullable=False)
    api_key = db.Column(db.String(255), default="", nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    extra = db.Column("metadata", db.JSON, default=dict, nullable=False)

    tenant = db.relationship("Tenant", back_populates="channels")


class Contact(TimestampMixin, db.Model):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("tenant_id", "wa_id", name="uq_contact_tenant_wa_id"),)

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    wa_id = db.Column(db.String(160), nullable=False, index=True)
    phone = db.Column(db.String(40), default="", nullable=False)
    name = db.Column(db.String(160), default="", nullable=False)
    tags = db.Column(db.JSON, default=list, nullable=False)
    attributes = db.Column(db.JSON, default=dict, nullable=False)
    opted_out = db.Column(db.Boolean, default=False, nullable=False)
    last_seen_at = db.Column(db.DateTime(timezone=True), nullable=True)

    tenant = db.relationship("Tenant", back_populates="contacts")
    conversations = db.relationship("Conversation", back_populates="contact", cascade="all, delete-orphan")


class Conversation(TimestampMixin, db.Model):
    __tablename__ = "conversations"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    contact_id = db.Column(db.String(36), db.ForeignKey("contacts.id"), nullable=False, index=True)
    channel_id = db.Column(db.String(36), db.ForeignKey("channels.id"), nullable=True, index=True)
    status = db.Column(db.String(40), default="open", nullable=False, index=True)  # open, pending_human, closed
    bot_paused = db.Column(db.Boolean, default=False, nullable=False)
    priority = db.Column(db.String(20), default="normal", nullable=False)
    last_message_at = db.Column(db.DateTime(timezone=True), nullable=True)
    context = db.Column(db.JSON, default=dict, nullable=False)

    contact = db.relationship("Contact", back_populates="conversations")
    messages = db.relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    tickets = db.relationship("SupportTicket", back_populates="conversation", cascade="all, delete-orphan")


class Message(TimestampMixin, db.Model):
    __tablename__ = "messages"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    conversation_id = db.Column(db.String(36), db.ForeignKey("conversations.id"), nullable=False, index=True)
    contact_id = db.Column(db.String(36), db.ForeignKey("contacts.id"), nullable=True, index=True)
    provider_message_id = db.Column(db.String(255), nullable=True, index=True)
    direction = db.Column(db.String(20), nullable=False, index=True)  # inbound, outbound, system
    message_type = db.Column(db.String(40), default="text", nullable=False)
    body = db.Column(db.Text, default="", nullable=False)
    media_url = db.Column(db.Text, default="", nullable=False)
    raw_payload = db.Column(db.JSON, default=dict, nullable=False)
    status = db.Column(db.String(40), default="received", nullable=False)

    conversation = db.relationship("Conversation", back_populates="messages")


class FlowState(TimestampMixin, db.Model):
    __tablename__ = "flow_states"
    __table_args__ = (UniqueConstraint("conversation_id", "key", name="uq_flow_conversation_key"),)

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    conversation_id = db.Column(db.String(36), db.ForeignKey("conversations.id"), nullable=False, index=True)
    key = db.Column(db.String(80), nullable=False)
    step = db.Column(db.String(80), default="", nullable=False)
    data = db.Column(db.JSON, default=dict, nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)


class FAQEntry(TimestampMixin, db.Model):
    __tablename__ = "faq_entries"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    question = db.Column(db.String(255), nullable=False)
    answer = db.Column(db.Text, nullable=False)
    keywords = db.Column(db.JSON, default=list, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    sort_order = db.Column(db.Integer, default=0, nullable=False)


class Product(TimestampMixin, db.Model):
    __tablename__ = "products"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, default="", nullable=False)
    category = db.Column(db.String(120), default="geral", nullable=False)
    price_cents = db.Column(db.Integer, default=0, nullable=False)
    currency = db.Column(db.String(3), default="BRL", nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    extra = db.Column("metadata", db.JSON, default=dict, nullable=False)


class Booking(TimestampMixin, db.Model):
    __tablename__ = "bookings"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    contact_id = db.Column(db.String(36), db.ForeignKey("contacts.id"), nullable=True, index=True)
    conversation_id = db.Column(db.String(36), db.ForeignKey("conversations.id"), nullable=True, index=True)
    service_name = db.Column(db.String(160), default="", nullable=False)
    scheduled_for = db.Column(db.DateTime(timezone=True), nullable=True)
    status = db.Column(db.String(40), default="requested", nullable=False)  # requested, confirmed, cancelled, done
    notes = db.Column(db.Text, default="", nullable=False)
    extra = db.Column("metadata", db.JSON, default=dict, nullable=False)


class Order(TimestampMixin, db.Model):
    __tablename__ = "orders"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    contact_id = db.Column(db.String(36), db.ForeignKey("contacts.id"), nullable=True, index=True)
    conversation_id = db.Column(db.String(36), db.ForeignKey("conversations.id"), nullable=True, index=True)
    status = db.Column(db.String(40), default="draft", nullable=False)
    total_cents = db.Column(db.Integer, default=0, nullable=False)
    items = db.Column(db.JSON, default=list, nullable=False)
    payment_status = db.Column(db.String(40), default="pending", nullable=False)
    payment_link = db.Column(db.String(255), default="", nullable=False)
    notes = db.Column(db.Text, default="", nullable=False)


class SupportTicket(TimestampMixin, db.Model):
    __tablename__ = "support_tickets"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    conversation_id = db.Column(db.String(36), db.ForeignKey("conversations.id"), nullable=True, index=True)
    contact_id = db.Column(db.String(36), db.ForeignKey("contacts.id"), nullable=True, index=True)
    subject = db.Column(db.String(180), default="Atendimento", nullable=False)
    status = db.Column(db.String(40), default="open", nullable=False)
    priority = db.Column(db.String(20), default="normal", nullable=False)
    assigned_to = db.Column(db.String(120), default="", nullable=False)
    notes = db.Column(db.Text, default="", nullable=False)

    conversation = db.relationship("Conversation", back_populates="tickets")


class Campaign(TimestampMixin, db.Model):
    __tablename__ = "campaigns"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    body = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(40), default="draft", nullable=False)
    filters = db.Column(db.JSON, default=dict, nullable=False)
    stats = db.Column(db.JSON, default=dict, nullable=False)


class OutboxMessage(TimestampMixin, db.Model):
    __tablename__ = "outbox_messages"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    contact_id = db.Column(db.String(36), db.ForeignKey("contacts.id"), nullable=True, index=True)
    channel_id = db.Column(db.String(36), db.ForeignKey("channels.id"), nullable=True, index=True)
    to_wa_id = db.Column(db.String(160), nullable=False)
    body = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(40), default="queued", nullable=False)
    provider_response = db.Column(db.JSON, default=dict, nullable=False)
    error = db.Column(db.Text, default="", nullable=False)
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)


class AnalyticsEvent(TimestampMixin, db.Model):
    __tablename__ = "analytics_events"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=False, index=True)
    event_type = db.Column(db.String(80), nullable=False, index=True)
    contact_id = db.Column(db.String(36), db.ForeignKey("contacts.id"), nullable=True, index=True)
    conversation_id = db.Column(db.String(36), db.ForeignKey("conversations.id"), nullable=True, index=True)
    data = db.Column(db.JSON, default=dict, nullable=False)


class AuditLog(TimestampMixin, db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.String(36), primary_key=True, default=uuid_str)
    tenant_id = db.Column(db.String(36), db.ForeignKey("tenants.id"), nullable=True, index=True)
    actor = db.Column(db.String(120), default="system", nullable=False)
    action = db.Column(db.String(120), nullable=False)
    entity_type = db.Column(db.String(80), default="", nullable=False)
    entity_id = db.Column(db.String(36), default="", nullable=False)
    data = db.Column(db.JSON, default=dict, nullable=False)
