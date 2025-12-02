import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()


def _read_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def require_api_base_url() -> str:
    """
    API must come from .env: prefer API_URL, fallback to API_UPSTREAM, no defaults.
    Fails fast if neither is provided to avoid silent misconfiguration.
    """
    api_url = _read_env("API_URL")
    if api_url:
        return api_url

    api_upstream = _read_env("API_UPSTREAM")
    if api_upstream:
        return api_upstream

    raise RuntimeError("Set API_URL or API_UPSTREAM in .env before starting the app.")


DATABASE_URL = os.getenv("DATABASE_URL")
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

API_BASE_URL = require_api_base_url()
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
UI_PATH = Path(__file__).parent.parent / "frontend"
