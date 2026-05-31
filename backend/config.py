from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GOOGLE_API_KEY: str
    GOOGLE_CLIENT_ID: str = ""

    # Encryption key for user tokens (auto-generated if not set)
    ENCRYPTION_KEY: str = ""

    # JWT secret for session tokens (auto-generated if not set)
    JWT_SECRET: str = ""

    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    SLACK_CLIENT_ID: str | None = None
    SLACK_CLIENT_SECRET: str | None = None

    LINEAR_CLIENT_ID: str | None = None
    LINEAR_CLIENT_SECRET: str | None = None

    SENTRY_CLIENT_ID: str | None = None
    SENTRY_CLIENT_SECRET: str | None = None
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()

# Auto-generate encryption key and JWT secret if not provided and save to .env
import secrets
import os
from cryptography.fernet import Fernet

env_path = os.path.join(os.path.dirname(__file__), ".env")
env_updates = []

if not settings.ENCRYPTION_KEY:
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    env_updates.append(f"\nENCRYPTION_KEY={settings.ENCRYPTION_KEY}")

if not settings.JWT_SECRET:
    settings.JWT_SECRET = secrets.token_hex(32)
    env_updates.append(f"\nJWT_SECRET={settings.JWT_SECRET}")

if env_updates and os.path.exists(env_path):
    with open(env_path, "a") as f:
        f.writelines(env_updates)
