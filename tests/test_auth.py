import uuid
from fastapi.testclient import TestClient


def test_viewer_cannot_create_tab(client: TestClient):
    user_name = f"viewer_{uuid.uuid4().hex[:8]}"
    password = "viewerpass"

    # create viewer via admin token (client already authorized as admin)
    resp = client.post(
        "/auth/register",
        json={"user_name": user_name, "password": password, "role": "viewer"},
    )
    assert resp.status_code == 200

    login = client.post("/auth/login", json={"user_name": user_name, "password": password})
    assert login.status_code == 200
    token = login.json()["access_token"]

    create_tab_resp = client.post(
        "/tabs",
        json={"name": f"Viewer Tab {uuid.uuid4().hex[:4]}"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_tab_resp.status_code == 403
