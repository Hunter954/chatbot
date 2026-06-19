import re
from dataclasses import dataclass

from rapidfuzz import fuzz


@dataclass
class IntentResult:
    name: str
    confidence: float
    entities: dict


KEYWORDS = {
    "greeting": ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu", "iniciar", "começar"],
    "prices": ["preço", "preco", "valor", "quanto", "tabela", "serviço", "servico", "planos", "produtos"],
    "hours_location": ["horário", "horario", "abre", "fecha", "endereço", "endereco", "localização", "localizacao", "onde fica"],
    "booking": ["agendar", "reservar", "marcar", "horário livre", "mesa", "computador", "pc"],
    "support": ["problema", "erro", "reclamação", "reclamacao", "ajuda", "suporte", "travou", "não funciona", "nao funciona"],
    "human": ["atendente", "humano", "pessoa", "falar com alguém", "falar com alguem", "gerente"],
    "cancel": ["cancelar", "voltar", "sair", "encerrar", "parar"],
    "optout": ["sair da lista", "não quero receber", "nao quero receber", "pare de mandar", "stop"],
}


def classify(text: str) -> IntentResult:
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return IntentResult("unknown", 0.0, {})

    entities: dict = {}
    if re.fullmatch(r"[0-9]", cleaned):
        mapping = {
            "1": "prices",
            "2": "hours_location",
            "3": "booking",
            "4": "support",
            "5": "human",
            "0": "cancel",
        }
        return IntentResult(mapping.get(cleaned, "unknown"), 0.98, {"menu_option": cleaned})

    best_name = "unknown"
    best_score = 0.0
    for intent, words in KEYWORDS.items():
        for word in words:
            if word in cleaned:
                score = 0.95
            else:
                score = fuzz.partial_ratio(word, cleaned) / 100
            if score > best_score:
                best_score = score
                best_name = intent

    if best_score < 0.70:
        best_name = "unknown"

    return IntentResult(best_name, best_score, entities)
