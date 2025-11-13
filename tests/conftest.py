# tests/conftest.py

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import get_db
from app.models import Base 

# Тестовая БД (SQLite, чтобы не портить Postgres)
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Создаём таблицы перед всеми тестами."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def override_get_db():
    """Переопределяем зависимость FastAPI для тестов."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module")
def client():
    """Возвращаем TestClient с тестовой БД и авторизацией администратора."""
    bootstrap_client = TestClient(app)
    admin_payload = {
        "user_name": "admin_master",
        "password": "adminpass",
        "role": "admin",
    }
    bootstrap_client.post("/auth/register", json=admin_payload)
    login_resp = bootstrap_client.post(
        "/auth/login",
        json={"user_name": admin_payload["user_name"], "password": admin_payload["password"]},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    class AuthedClient(TestClient):
        def __init__(self, application, token):
            super().__init__(application)
            self._token = token

        def request(self, method, url, **kwargs):  # type: ignore[override]
            headers = kwargs.pop("headers", {}) or {}
            if "Authorization" not in headers:
                headers["Authorization"] = f"Bearer {self._token}"
            return super().request(method, url, headers=headers, **kwargs)

    return AuthedClient(app, token)
