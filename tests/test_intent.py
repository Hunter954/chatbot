from app.services.intent import classify


def test_menu_number_prices():
    assert classify("1").name == "prices"


def test_human_intent():
    result = classify("quero falar com atendente")
    assert result.name == "human"
    assert result.confidence >= 0.7


def test_booking_intent():
    assert classify("quero reservar um pc amanhã").name == "booking"
