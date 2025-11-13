from fastapi.testclient import TestClient


def _create_tab(client: TestClient, name: str):
    resp = client.post("/tabs/", json={"name": name})
    assert resp.status_code == 200
    return resp.json()


def _create_field(client: TestClient, tab_id: int, name: str):
    resp = client.post("/tab_fields/", json={"tab_id": tab_id, "name": name})
    assert resp.status_code == 200
    return resp.json()


def _create_box(client: TestClient, tab_id: int, name: str):
    resp = client.post("/boxes/", json={"name": name, "tab_id": tab_id})
    assert resp.status_code == 200
    return resp.json()


def _create_item(client: TestClient, tab_id: int, box_id: int, name: str):
    payload = {
        "name": name,
        "tab_id": tab_id,
        "box_id": box_id,
        "qty": 1,
        "metadata_json": {"Spec": name},
    }
    resp = client.post("/items/", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_reorder_items_within_box(client: TestClient):
    tab = _create_tab(client, "ReorderTab")
    _create_field(client, tab["id"], "Spec")
    box = _create_box(client, tab["id"], "Reorder Box")

    items = [
        _create_item(client, tab["id"], box["id"], f"Item {idx}")
        for idx in range(3)
    ]

    desired_order = [items[2]["id"], items[0]["id"], items[1]["id"]]

    reorder_resp = client.post(
        "/items/reorder",
        json={"box_id": box["id"], "ordered_ids": desired_order},
    )
    assert reorder_resp.status_code == 200, reorder_resp.text
    reordered = reorder_resp.json()

    assert [item["id"] for item in reordered] == desired_order
    assert [item["box_position"] for item in reordered] == [1, 2, 3]

    persisted_resp = client.get(f"/items/{box['id']}")
    assert persisted_resp.status_code == 200
    persisted_ids = [item["id"] for item in persisted_resp.json()]
    assert persisted_ids == desired_order
