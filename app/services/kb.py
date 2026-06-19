from rapidfuzz import fuzz

from app.models import FAQEntry, Product
from app.services.formatting import money


def find_best_faq(tenant_id: str, text: str, threshold: float = 72.0) -> tuple[FAQEntry | None, float]:
    entries = FAQEntry.query.filter_by(tenant_id=tenant_id, is_active=True).all()
    best = None
    best_score = 0.0
    query = (text or "").lower()
    for entry in entries:
        haystacks = [entry.question or ""] + list(entry.keywords or [])
        score = max(fuzz.token_set_ratio(query, str(item).lower()) for item in haystacks)
        if score > best_score:
            best = entry
            best_score = float(score)
    if best and best_score >= threshold:
        return best, best_score
    return None, best_score


def product_catalog_text(tenant_id: str, limit: int = 12) -> str:
    products = (
        Product.query.filter_by(tenant_id=tenant_id, is_active=True)
        .order_by(Product.category.asc(), Product.name.asc())
        .limit(limit)
        .all()
    )
    if not products:
        return "Ainda não cadastrei serviços/produtos para este estabelecimento."

    lines = ["📋 *Serviços e preços*", ""]
    current_category = None
    for product in products:
        if product.category != current_category:
            current_category = product.category
            lines.append(f"*{current_category.title()}*")
        description = f" — {product.description}" if product.description else ""
        lines.append(f"• {product.name}: {money(product.price_cents, product.currency)}{description}")
    lines.append("")
    lines.append("Digite *3* para reservar/agendar ou *5* para falar com um atendente.")
    return "\n".join(lines)
