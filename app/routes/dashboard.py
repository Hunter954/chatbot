from flask import Blueprint, current_app, redirect, render_template, request, url_for

from app.models import Booking, Conversation, Message, SupportTicket
from app.services.analytics import tenant_summary
from app.services.bot_engine import get_default_tenant


dashboard_bp = Blueprint("dashboard", __name__)


def _authorized() -> bool:
    token = request.args.get("token") or request.headers.get("X-Admin-Token")
    return bool(token and token == current_app.config.get("ADMIN_API_TOKEN"))


@dashboard_bp.get("")
@dashboard_bp.get("/")
def dashboard_home():
    if not _authorized():
        return render_template("login_hint.html"), 401
    tenant = get_default_tenant()
    if not tenant:
        return "Tenant não encontrado", 404
    conversations = Conversation.query.filter_by(tenant_id=tenant.id).order_by(Conversation.updated_at.desc()).limit(15).all()
    tickets = SupportTicket.query.filter_by(tenant_id=tenant.id, status="open").order_by(SupportTicket.updated_at.desc()).limit(10).all()
    bookings = Booking.query.filter_by(tenant_id=tenant.id).order_by(Booking.created_at.desc()).limit(10).all()
    return render_template(
        "dashboard.html",
        tenant=tenant,
        summary=tenant_summary(tenant.id),
        conversations=conversations,
        tickets=tickets,
        bookings=bookings,
        token=request.args.get("token"),
    )


@dashboard_bp.get("/conversations/<conversation_id>")
def conversation_view(conversation_id):
    if not _authorized():
        return redirect(url_for("dashboard.dashboard_home"))
    conversation = Conversation.query.get_or_404(conversation_id)
    messages = Message.query.filter_by(conversation_id=conversation.id).order_by(Message.created_at.asc()).limit(300).all()
    return render_template("conversation.html", conversation=conversation, messages=messages, token=request.args.get("token"))
