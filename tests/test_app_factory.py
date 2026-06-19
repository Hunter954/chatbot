from app import create_app
from app.extensions import db


class TestConfig:
    TESTING = True
    SECRET_KEY = "test"
    ADMIN_API_TOKEN = "admin"
    OPENWA_WEBHOOK_SECRET = "webhook"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    AUTO_CREATE_TABLES = False
    SEED_DEMO = False
    DEFAULT_TENANT_SLUG = "lanhouse-demo"
    BOT_DISABLED = False
    IGNORE_GROUP_MESSAGES = True
    RATE_LIMIT_PER_MINUTE = 25
    OPENWA_BASE_URL = ""
    OPENWA_API_KEY = ""
    OPENWA_SESSION_ID = "default"
    OPENWA_TIMEOUT_SECONDS = 1
    AI_FALLBACK_ENABLED = False
    AI_API_BASE_URL = ""
    AI_API_KEY = ""
    AI_MODEL = "test"
    AI_TIMEOUT_SECONDS = 1


def test_healthz():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
    client = app.test_client()
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.get_json()["ok"] is True
