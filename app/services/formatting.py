def money(cents: int, currency: str = "BRL") -> str:
    value = (cents or 0) / 100
    if currency == "BRL":
        return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{currency} {value:.2f}"


def first_name(name: str) -> str:
    cleaned = (name or "").strip()
    return cleaned.split()[0] if cleaned else ""
