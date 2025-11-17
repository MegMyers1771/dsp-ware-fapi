from fastapi.testclient import TestClient

from tests.conftest import TestingSessionLocal
from app import models


def ensure_user(client: TestClient, user_name: str, password: str = "pass123", role: str = "editor"):
    resp = client.post(
        "/auth/register",
        json={"user_name": user_name, "password": password, "role": role},
    )
    if resp.status_code not in (200, 400):
        raise AssertionError(f"Failed to ensure user {user_name}: {resp.text}")


def test_root(client: TestClient):
    r = client.get("/")
    assert r.status_code == 200


def test_issue_item_flow(client: TestClient):
    tab_res = client.post("/tabs", json={"name": "Test Tab"})
    assert tab_res.status_code == 200
    tab_id = tab_res.json()["id"]

    field_res = client.post(
        "/tab_fields",
        json={"tab_id": tab_id, "name": "Serial", "strong": False},
    )
    assert field_res.status_code == 200

    box_res = client.post(
        "/boxes",
        json={"tab_id": tab_id, "name": "Box A", "description": ""},
    )
    assert box_res.status_code == 200
    box_id = box_res.json()["id"]

    item_payload = {
        "name": "Router",
        "tab_id": tab_id,
        "box_id": box_id,
        "metadata_json": {},
        "tag_ids": [],
        "qty": 1,
        "position": 1,
    }
    item_res = client.post("/items/", json=item_payload)
    assert item_res.status_code == 200
    item_id = item_res.json()["id"]

    status_res = client.post(
        "/statuses/",
        json={"name": "Issued", "color": "#00ff00"},
    )
    assert status_res.status_code == 200
    status_id = status_res.json()["id"]

    responsible_user_name = "tester_user"
    ensure_user(client, responsible_user_name)

    issue_res = client.post(
        f"/items/{item_id}/issue",
        json={
            "status_id": status_id,
            "responsible_user_name": responsible_user_name,
            "serial_number": "SN-001",
            "invoice_number": "INV-9",
        },
    )
    assert issue_res.status_code == 200
    issue_body = issue_res.json()
    assert issue_body["responsible_user_name"] == responsible_user_name
    assert "Router" in issue_body["item_snapshot"]
    assert issue_body["serial_number"] == "SN-001"
    assert issue_body["invoice_number"] == "INV-9"

    items_in_box = client.get(f"/items/{box_id}")
    assert items_in_box.status_code == 200
    assert items_in_box.json() == []

    with TestingSessionLocal() as session:
        stored_issue = session.query(models.Issue).first()
        stored_history = session.query(models.ItemUtilized).first()
        assert stored_issue is not None
        assert stored_history is not None
        assert stored_history.issue_id == stored_issue.id
        assert stored_history.serial_number == "SN-001"
        assert stored_history.invoice_number == "INV-9"
        assert stored_history.responsible_user.user_name == responsible_user_name


def test_issue_item_decrements_quantity(client: TestClient):
    tab_res = client.post("/tabs", json={"name": "Qty Tab"})
    assert tab_res.status_code == 200
    tab_id = tab_res.json()["id"]

    field_res = client.post(
        "/tab_fields",
        json={"tab_id": tab_id, "name": "Spec", "strong": False},
    )
    assert field_res.status_code == 200

    box_res = client.post(
        "/boxes",
        json={"tab_id": tab_id, "name": "Qty Box", "description": ""},
    )
    assert box_res.status_code == 200
    box_id = box_res.json()["id"]

    item_res = client.post(
        "/items/",
        json={
            "name": "Multi Item",
            "tab_id": tab_id,
            "box_id": box_id,
            "metadata_json": {"Spec": "value"},
            "tag_ids": [],
            "qty": 3,
            "position": 1,
        },
    )
    assert item_res.status_code == 200, item_res.text
    item_id = item_res.json()["id"]

    status_res = client.post("/statuses/", json={"name": "IssuedQty", "color": "#123123"})
    assert status_res.status_code == 200
    status_id = status_res.json()["id"]

    responsible_user_name = "qty_check_user"
    ensure_user(client, responsible_user_name)

    def issue_once():
        resp = client.post(
            f"/items/{item_id}/issue",
            json={
                "status_id": status_id,
                "responsible_user_name": responsible_user_name,
                "serial_number": None,
                "invoice_number": None,
            },
        )
        assert resp.status_code == 200, resp.text

    issue_once()
    items_after_first = client.get(f"/items/{box_id}")
    assert items_after_first.status_code == 200
    payload = items_after_first.json()
    assert len(payload) == 1
    assert payload[0]["qty"] == 2

    issue_once()
    items_after_second = client.get(f"/items/{box_id}")
    assert items_after_second.status_code == 200
    payload = items_after_second.json()
    assert len(payload) == 1
    assert payload[0]["qty"] == 1

    issue_once()
    items_after_third = client.get(f"/items/{box_id}")
    assert items_after_third.status_code == 200
    assert items_after_third.json() == []


def test_issue_history_listing(client: TestClient):
    tab_res = client.post("/tabs", json={"name": "History Tab"})
    assert tab_res.status_code == 200
    tab_id = tab_res.json()["id"]

    client.post(
        "/tab_fields",
        json={"tab_id": tab_id, "name": "Spec", "strong": False},
    )

    box_res = client.post(
        "/boxes",
        json={"tab_id": tab_id, "name": "History Box", "description": ""},
    )
    assert box_res.status_code == 200
    box_id = box_res.json()["id"]

    item_res = client.post(
        "/items/",
        json={
            "name": "Switch",
            "tab_id": tab_id,
            "box_id": box_id,
            "metadata_json": {"Spec": "24p"},
            "tag_ids": [],
            "qty": 1,
            "position": 1,
        },
    )
    assert item_res.status_code == 200
    item_id = item_res.json()["id"]

    status_res = client.post(
        "/statuses/",
        json={"name": "History", "color": "#ff9900"},
    )
    assert status_res.status_code == 200
    status_id = status_res.json()["id"]

    responsible_user_name = "operator_user"
    ensure_user(client, responsible_user_name)

    issue_res = client.post(
        f"/items/{item_id}/issue",
        json={
            "status_id": status_id,
            "responsible_user_name": responsible_user_name,
            "serial_number": "HIST-42",
            "invoice_number": "INV-42",
        },
    )
    assert issue_res.status_code == 200

    history_res = client.get("/issues")
    assert history_res.status_code == 200
    history = history_res.json()
    assert isinstance(history, list)
    target = next((entry for entry in history if entry["serial_number"] == "HIST-42"), None)
    assert target is not None
    assert target["status_name"] == "History"
    assert target["responsible_user_name"] == responsible_user_name
    assert target["invoice_number"] == "INV-42"
    assert target["item_snapshot"].get("item_name") == "Switch"


def test_status_deletion_rules(client: TestClient):
    status_res = client.post("/statuses/", json={"name": "Temp Status", "color": "#101010"})
    assert status_res.status_code == 200
    status_id = status_res.json()["id"]

    delete_res = client.delete(f"/statuses/{status_id}")
    assert delete_res.status_code == 200, delete_res.text

    used_status_res = client.post("/statuses/", json={"name": "Used Status", "color": "#202020"})
    assert used_status_res.status_code == 200
    used_status_id = used_status_res.json()["id"]

    tab_res = client.post("/tabs", json={"name": "Status Tab"})
    assert tab_res.status_code == 200
    tab_id = tab_res.json()["id"]

    field_res = client.post("/tab_fields", json={"tab_id": tab_id, "name": "Meta", "strong": False})
    assert field_res.status_code == 200

    box_res = client.post("/boxes", json={"tab_id": tab_id, "name": "Status Box", "description": ""})
    assert box_res.status_code == 200
    box_id = box_res.json()["id"]

    item_res = client.post(
        "/items/",
        json={
            "name": "Status Item",
            "tab_id": tab_id,
            "box_id": box_id,
            "metadata_json": {},
            "tag_ids": [],
            "qty": 1,
            "position": 1,
        },
    )
    assert item_res.status_code == 200, item_res.text
    item_id = item_res.json()["id"]

    responsible = "status_user"
    ensure_user(client, responsible)

    issue_res = client.post(
        f"/items/{item_id}/issue",
        json={
            "status_id": used_status_id,
            "responsible_user_name": responsible,
            "serial_number": None,
            "invoice_number": None,
        },
    )
    assert issue_res.status_code == 200, issue_res.text

    blocked_delete = client.delete(f"/statuses/{used_status_id}")
    assert blocked_delete.status_code == 400

    statuses_res = client.get("/statuses")
    assert statuses_res.status_code == 200
    payload = statuses_res.json()
    target = next((entry for entry in payload if entry["id"] == used_status_id), None)
    assert target is not None
    assert target["usage_count"] >= 1
    assert target["can_delete"] is False
