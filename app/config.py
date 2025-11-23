import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"


DEFAULT_API_URL = os.getenv("API_UPSTREAM", "http://localhost:7878")
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
UI_PATH = Path(__file__).parent.parent / "frontend"
