from flask import current_app

from app.extensions import db
from app.models import Channel, FAQEntry, Product, Tenant


def seed_demo_data():
    slug = current_app.config.get("DEFAULT_TENANT_SLUG", "lanhouse-demo")
    tenant = Tenant.query.filter_by(slug=slug).first()
    if not tenant:
        tenant = Tenant(
            name="Lan House Demo",
            slug=slug,
            segment="lan_house",
            timezone="America/Sao_Paulo",
            settings={
                "business_name": "Lan House Demo",
                "tone": "prestativo, moderno e objetivo",
                "business_hours": "Segunda a sábado, 09h às 20h",
                "address": "Rua Principal, 123 - Centro",
                "maps_url": "https://maps.google.com/?q=Rua+Principal+123",
                "main_menu": "👋 Olá! Eu sou o assistente virtual da *Lan House Demo*.\n\nEscolha uma opção:\n*1* — Serviços e preços\n*2* — Horários e localização\n*3* — Reservar computador/serviço\n*4* — Suporte técnico\n*5* — Falar com atendente\n*0* — Encerrar\n\nPode também escrever sua dúvida em uma frase.",
            },
        )
        db.session.add(tenant)
        db.session.flush()

    if not Channel.query.filter_by(tenant_id=tenant.id, provider="openwa").first():
        db.session.add(
            Channel(
                tenant_id=tenant.id,
                provider="openwa",
                name="WhatsApp Principal",
                session_id=current_app.config.get("OPENWA_SESSION_ID", "default"),
                base_url=current_app.config.get("OPENWA_BASE_URL", ""),
                api_key=current_app.config.get("OPENWA_API_KEY", ""),
                is_active=True,
            )
        )

    if Product.query.filter_by(tenant_id=tenant.id).count() == 0:
        products = [
            Product(tenant_id=tenant.id, category="computadores", name="Uso do PC - 1 hora", description="Internet, estudos, jogos leves e impressão de documentos", price_cents=500),
            Product(tenant_id=tenant.id, category="computadores", name="Pacote 3 horas", description="Ideal para jogos, estudos e trabalhos", price_cents=1300),
            Product(tenant_id=tenant.id, category="impressão", name="Impressão P&B", description="Por página A4", price_cents=100),
            Product(tenant_id=tenant.id, category="impressão", name="Impressão colorida", description="Por página A4", price_cents=250),
            Product(tenant_id=tenant.id, category="serviços digitais", name="2ª via de boleto", description="Emissão/consulta com ajuda de atendente", price_cents=500),
            Product(tenant_id=tenant.id, category="serviços digitais", name="Currículo simples", description="Criação e envio em PDF", price_cents=2000),
            Product(tenant_id=tenant.id, category="serviços digitais", name="Digitalização", description="Scanner por página", price_cents=150),
        ]
        db.session.add_all(products)

    if FAQEntry.query.filter_by(tenant_id=tenant.id).count() == 0:
        faqs = [
            FAQEntry(
                tenant_id=tenant.id,
                question="Quais são os horários de atendimento?",
                answer="Atendemos de segunda a sábado, das 09h às 20h. Em feriados, confirme pelo WhatsApp antes de vir.",
                keywords=["horário", "abre", "fecha", "funciona hoje", "sábado"],
                sort_order=1,
            ),
            FAQEntry(
                tenant_id=tenant.id,
                question="Precisa reservar computador?",
                answer="Não é obrigatório, mas recomendamos reservar em horários de pico. Digite *3* para solicitar uma reserva.",
                keywords=["reservar pc", "computador livre", "pc disponível", "agendar computador"],
                sort_order=2,
            ),
            FAQEntry(
                tenant_id=tenant.id,
                question="Vocês imprimem documentos pelo WhatsApp?",
                answer="Sim. Envie o arquivo aqui no WhatsApp e informe se quer preto e branco ou colorido. Um atendente confirma o valor e o prazo.",
                keywords=["imprimir", "impressão", "documento", "pdf", "whatsapp"],
                sort_order=3,
            ),
            FAQEntry(
                tenant_id=tenant.id,
                question="Vocês fazem currículo?",
                answer="Sim. Fazemos currículo simples e entregamos em PDF. Digite *5* para falar com atendente e enviar seus dados.",
                keywords=["currículo", "curriculo", "fazer cv", "pdf"],
                sort_order=4,
            ),
            FAQEntry(
                tenant_id=tenant.id,
                question="Quais formas de pagamento aceitam?",
                answer="Aceitamos dinheiro, Pix e cartão. Para serviços online, o atendente pode enviar uma chave Pix ou link de pagamento.",
                keywords=["pix", "cartão", "pagamento", "dinheiro", "pagar"],
                sort_order=5,
            ),
        ]
        db.session.add_all(faqs)

    db.session.commit()
