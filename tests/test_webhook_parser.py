from app.services.webhook_parser import parse_openwa_payload


def test_parse_openwa_direct_message():
    payload = {
        "id": "abc",
        "from": "5546999999999@c.us",
        "chatId": "5546999999999@c.us",
        "notifyName": "Alexandre",
        "body": "menu",
        "type": "text",
    }
    msg = parse_openwa_payload(payload)
    assert msg is not None
    assert msg.body == "menu"
    assert msg.from_id == "5546999999999@c.us"
    assert msg.sender_name == "Alexandre"
