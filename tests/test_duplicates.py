import uuid
from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def test_tab_name_uniqueness(client: TestClient):
    base_name = _unique("TabDup")
    create_resp = client.post("/tabs/", json={"name": base_name})
    assert create_resp.status_code == 200

    dup_resp = client.post("/tabs/", json={"name": base_name})
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"]

    other_resp = client.post("/tabs/", json={"name": _unique("TabOther")})
    assert other_resp.status_code == 200

    update_resp = client.put(
        f"/tabs/{other_resp.json()['id']}",
        json={"name": base_name, "description": "", "tag_ids": []},
    )
    assert update_resp.status_code == 400


def test_box_name_uniqueness_within_tab(client: TestClient):
    tab = client.post("/tabs/", json={"name": _unique("TabBox")}).json()

    box_name = _unique("BoxDup")
    box_resp = client.post("/boxes/", json={"name": box_name, "tab_id": tab["id"]})
    assert box_resp.status_code == 200

    dup_box_resp = client.post("/boxes/", json={"name": box_name, "tab_id": tab["id"]})
    assert dup_box_resp.status_code == 400

    other_box_resp = client.post(
        "/boxes/",
        json={"name": _unique("BoxOther"), "tab_id": tab["id"]},
    )
    assert other_box_resp.status_code == 200
    other_box = other_box_resp.json()

    dup_update = client.put(
        f"/boxes/{other_box['id']}",
        json={"name": box_name, "description": None, "tag_ids": []},
    )
    assert dup_update.status_code == 400


def test_tag_name_uniqueness(client: TestClient):
    tag_name = _unique("TagDup")
    create_resp = client.post("/tags/", json={"name": tag_name})
    assert create_resp.status_code == 200

    dup_resp = client.post("/tags/", json={"name": tag_name})
    assert dup_resp.status_code == 400

    other_resp = client.post("/tags/", json={"name": _unique("TagOther")})
    assert other_resp.status_code == 200
    other_tag_id = other_resp.json()["id"]

    dup_update = client.put(f"/tags/{other_tag_id}", json={"name": tag_name})
    assert dup_update.status_code == 400


def test_item_names_can_repeat_within_box(client: TestClient):
    tab_resp = client.post("/tabs/", json={"name": _unique("TabItem")})
    assert tab_resp.status_code == 200
    tab = tab_resp.json()

    field_resp = client.post(
        "/tab_fields/",
        json={"tab_id": tab["id"], "name": "Spec"},
    )
    assert field_resp.status_code == 200

    box_resp = client.post("/boxes/", json={"name": _unique("BoxItem"), "tab_id": tab["id"]})
    assert box_resp.status_code == 200
    box = box_resp.json()

    item_name = _unique("ItemDup")
    base_payload = {
        "name": item_name,
        "tab_id": tab["id"],
        "box_id": box["id"],
        "metadata_json": {"Spec": "Value"},
    }

    first_item_resp = client.post("/items/", json=base_payload)
    assert first_item_resp.status_code == 200

    dup_item_resp = client.post("/items/", json=base_payload)
    assert dup_item_resp.status_code == 200

    second_payload = {**base_payload, "name": _unique("ItemOther")}
    second_item_resp = client.post("/items/", json=second_payload)
    assert second_item_resp.status_code == 200
    second_item = second_item_resp.json()

    dup_update_payload = {
        "name": item_name,
        "qty": second_item["qty"],
        "position": second_item["box_position"],
        "metadata_json": second_item["metadata_json"],
        "tag_ids": second_item["tag_ids"],
        "box_id": second_item["box_id"],
    }

    dup_update_resp = client.put(
        f"/items/{second_item['id']}",
        json=dup_update_payload,
    )
    assert dup_update_resp.status_code == 200
    assert dup_update_resp.json()["name"] == item_name
