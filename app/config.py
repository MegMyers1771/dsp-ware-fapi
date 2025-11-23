import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()


def _normalize_api_url(raw: str | None, default: str) -> str:
    """Ensure an API URL always has a scheme."""
    if not raw:
        return default
    value = raw.strip()
    if not value:
        return default
    if value.startswith(("http://", "https://")):
        return value
    return f"http://{value}"


DATABASE_URL = os.getenv("DATABASE_URL")
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

_api_default = "http://localhost:7878"
DEFAULT_API_URL = _normalize_api_url(os.getenv("API_UPSTREAM") or os.getenv("API_URL"), _api_default)
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
UI_PATH = Path(__file__).parent.parent / "frontend"
