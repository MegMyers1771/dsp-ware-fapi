import uuid

from fastapi.testclient import TestClient


def test_admin_can_delete_viewer_user(client: TestClient):
    user_name = f"viewer_delete_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/auth/register",
        json={"user_name": user_name, "password": "viewerpass", "role": "viewer"},
    )
    assert resp.status_code == 200
    user_id = resp.json()["id"]

    delete_resp = client.delete(f"/users/{user_id}")
    assert delete_resp.status_code == 204

    remaining_users = client.get("/users").json()
    assert all(u["id"] != user_id for u in remaining_users)


def test_cannot_delete_last_admin(client: TestClient):
    users = client.get("/users").json()
    admin = next((user for user in users if user["role"] == "admin"), None)
    assert admin is not None

    delete_resp = client.delete(f"/users/{admin['id']}")
    assert delete_resp.status_code == 400
    assert delete_resp.json()["detail"] == "Нельзя удалить единственного администратора"


def test_admin_can_remove_other_admin(client: TestClient):
    admin_name = f"admin_backup_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/auth/register",
        json={"user_name": admin_name, "password": "adminpass", "role": "admin"},
    )
    assert resp.status_code == 200
    second_admin_id = resp.json()["id"]

    delete_resp = client.delete(f"/users/{second_admin_id}")
    assert delete_resp.status_code == 204
