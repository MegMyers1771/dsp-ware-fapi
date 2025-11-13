from fastapi.testclient import TestClient

from tests.conftest import TestingSessionLocal
from app import models


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

    issue_res = client.post(
        f"/items/{item_id}/issue",
        json={
            "status_id": status_id,
            "responsible": "tester",
            "serial_number": "SN-001",
            "invoice_number": "INV-9",
        },
    )
    assert issue_res.status_code == 200
    issue_body = issue_res.json()
    assert issue_body["responsible"] == "tester"
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

    issue_res = client.post(
        f"/items/{item_id}/issue",
        json={
            "status_id": status_id,
            "responsible": "operator",
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
    assert target["responsible"] == "operator"
    assert target["invoice_number"] == "INV-42"
    assert target["item_snapshot"].get("item_name") == "Switch"
