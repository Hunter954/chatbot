import os
from datetime import timedelta


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    ADMIN_API_TOKEN = os.getenv("ADMIN_API_TOKEN", "change-me")
    OPENWA_WEBHOOK_SECRET = os.getenv("OPENWA_WEBHOOK_SECRET", "change-me")
    PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "")

    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/openwa_chatbot",
    )
    # Railway sometimes provides postgres://; SQLAlchemy wants postgresql+psycopg:// here.
    if SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace("postgres://", "postgresql+psycopg://", 1)
    elif SQLALCHEMY_DATABASE_URI.startswith("postgresql://"):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace("postgresql://", "postgresql+psycopg://", 1)

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }

    AUTO_CREATE_TABLES = _bool("AUTO_CREATE_TABLES", True)
    SEED_DEMO = _bool("SEED_DEMO", True)
    DEFAULT_TENANT_SLUG = os.getenv("DEFAULT_TENANT_SLUG", "lanhouse-demo")

    BOT_DISABLED = _bool("BOT_DISABLED", False)
    IGNORE_GROUP_MESSAGES = _bool("IGNORE_GROUP_MESSAGES", True)
    RATE_LIMIT_PER_MINUTE = _int("RATE_LIMIT_PER_MINUTE", 25)

    OPENWA_BASE_URL = os.getenv("OPENWA_BASE_URL", "").rstrip("/")
    OPENWA_API_KEY = os.getenv("OPENWA_API_KEY", "")
    OPENWA_SESSION_ID = os.getenv("OPENWA_SESSION_ID", "default")
    OPENWA_TIMEOUT_SECONDS = _int("OPENWA_TIMEOUT_SECONDS", 15)

    AI_FALLBACK_ENABLED = _bool("AI_FALLBACK_ENABLED", False)
    AI_API_BASE_URL = os.getenv("AI_API_BASE_URL", "").rstrip("/")
    AI_API_KEY = os.getenv("AI_API_KEY", "")
    AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")
    AI_TIMEOUT_SECONDS = _int("AI_TIMEOUT_SECONDS", 20)

    MAX_CONTENT_LENGTH = 25 * 1024 * 1024
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
