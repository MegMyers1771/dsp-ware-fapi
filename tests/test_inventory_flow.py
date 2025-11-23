import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def setup_data(client: TestClient):
    """
    Подготавливаем данные:
    - 2 вкладки (CPU, RAM)
    - по 2 поля для каждой
    - по 2 бокса для каждой
    - 2 тэга (мусор, проверить)
    """
    tabs = []
    for name in ["CPU", "RAM"]:
        r = client.post("/tabs/", json={"name": name})
        assert r.status_code == 200
        tabs.append(r.json())

    # Добавляем поля
    fields = [
        {"tab_id": tabs[0]["id"], "name": "Frequency", "field_type": "string"},
        {"tab_id": tabs[0]["id"], "name": "L3 Cache", "field_type": "string"},
        {"tab_id": tabs[1]["id"], "name": "Frequency", "field_type": "string"},
        {"tab_id": tabs[1]["id"], "name": "RANK", "field_type": "string"},
    ]
    for f in fields:
        r = client.post("/tab_fields/", json=f)
        assert r.status_code == 200

    # Добавляем боксы
    boxes = []
    for i, tab in enumerate(tabs):
        for j in range(2):
            box_data = {
                "name": f"{tab['name']} Box {j+1}",
                "tab_id": tab["id"],
                # "capacity": 26,
            }
            r = client.post("/boxes/", json=box_data)
            assert r.status_code == 200
            boxes.append(r.json())

    # Добавляем теги
    tags = []
    for name, color in [("мусор", "#ff0000"), ("проверить", "#00ff00")]:
        r = client.post("/tags/", json={"name": name, "color": color})
        assert r.status_code == 200
        tags.append(r.json())

    return {"tabs": tabs, "boxes": boxes, "tags": tags}


def test_create_items_with_tags(client: TestClient, setup_data):
    """
    Создаём по 3 айтема в каждом боксе:
    - для вкладки CPU: разные процессоры
    - для вкладки RAM: разные модули памяти
    После создания связываем первый айтем с тегом "мусор".
    """
    boxes = setup_data["boxes"]
    tags = setup_data["tags"]

    cpu_models = ["Intel i5-9400F", "Intel i7-9700K", "Ryzen 5 5600X"]
    ram_models = ["Kingston 8GB 3200", "Corsair 16GB 3600", "Crucial 8GB 2666"]

    created_items = []

    for i, box in enumerate(boxes):
        tab_id = box["tab_id"]
        is_cpu = i < 2  # первые два бокса относятся к CPU
        models = cpu_models if is_cpu else ram_models

        for n in range(3):
            if is_cpu:
                metadata = {
                    "Frequency": str(3000 + n * 300),
                    "L3 Cache": f"{6 + n * 2}MB"
                }
            else:
                metadata = {
                    "Frequency": str(2400 + n * 400),
                    "RANK": str(1 + n)
                }

            item_data = {
                "name": models[n],
                "tab_id": tab_id,
                "box_id": box["id"],
                "qty": 1,
                "metadata_json": metadata,
            }
            
            # print(item_data)
            
            r = client.post("/items/", json=item_data)
            assert r.status_code == 200, r.text
            created_items.append(r.json())
            # print(r.json())

    # Проверяем, что всего по 3 айтема на бокс
    assert len(created_items) == len(boxes) * 3

    first_item_id = created_items[0]["id"]
    attach_resp = client.post(
        f"/tags/{tags[0]['id']}/attach",
        json={"item_id": first_item_id}
    )
    assert attach_resp.status_code == 200

    linked_tag_resp = client.post(
        "/tags/",
        json={"name": "auto-link", "color": "#123456", "item_id": created_items[1]["id"]}
    )
    assert linked_tag_resp.status_code == 200
    auto_tag = linked_tag_resp.json()

    refreshed_items_resp = client.get(f"/items/{boxes[0]['id']}")
    assert refreshed_items_resp.status_code == 200
    refreshed_items = refreshed_items_resp.json()

    tagged_items = [i for i in refreshed_items if i["tag_ids"]]
    assert len(tagged_items) == 2
    assert tags[0]["id"] in tagged_items[0]["tag_ids"]
    assert auto_tag["id"] in tagged_items[1]["tag_ids"]

    # Проверяем, что позиции в каждом боксе присваиваются по порядку
    for box in boxes:
        box_items = [i for i in created_items if i["box_id"] == box["id"]]
        positions = [i["box_position"] for i in box_items]
        assert positions == list(range(1, len(box_items) + 1))

    print(created_items[:6])
    # Проверяем, что CPU айтемы содержат нужные поля
    for item in created_items[:6]:
        assert "Frequency" in item["metadata_json"]
        assert "L3 Cache" in item["metadata_json"]

    # Проверяем, что RAM айтемы содержат нужные поля
    for item in created_items[6:]:
        assert "Frequency" in item["metadata_json"]
        assert "RANK" in item["metadata_json"]



def test_search_by_tab_and_tag(client: TestClient, setup_data):
    """
    Проверяем, что поиск по вкладке и тегу работает.
    """
    tab_id = setup_data["tabs"][0]["id"]
    query = "9400F"

    r = client.get(f"/items/search?query={query}&tab_id={tab_id}")
    assert r.status_code == 200
    items = r.json()
    assert len(items['results']) == 2
    assert items['results'][0]["name"].startswith("Intel")
    
    tab_id = setup_data["tabs"][1]["id"]
    query = "8GB"
    r = client.get(f"/items/search?query={query}&tab_id={tab_id}")
    assert r.status_code == 200
    items = r.json()
    assert len(items['results']) == 4
    assert "8GB" in items['results'][0]["name"]


def test_box_position_reorders_on_delete(client: TestClient):
    """
    Проверяем, что при удалении айтема позиции в боксе сжимаются.
    """
    tab_resp = client.post("/tabs/", json={"name": "PositionTab"})
    assert tab_resp.status_code == 200
    tab = tab_resp.json()

    field_resp = client.post("/tab_fields/", json={"tab_id": tab["id"], "name": "Spec"})
    assert field_resp.status_code == 200

    box_resp = client.post(
        "/boxes/",
        json={
            "name": "Position Box",
            "tab_id": tab["id"],
            "description": None,
        },
    )
    assert box_resp.status_code == 200
    box = box_resp.json()

    item_ids = []
    for idx in range(3):
        item_resp = client.post(
            "/items/",
            json={
                "name": f"Item {idx}",
                "tab_id": tab["id"],
                "box_id": box["id"],
                "qty": 1,
                "metadata_json": {"Spec": f"Value {idx}"},
            },
        )
        assert item_resp.status_code == 200, item_resp.text
        payload = item_resp.json()
        item_ids.append(payload["id"])
        assert payload["box_position"] == idx + 1

    delete_resp = client.delete(f"/items/{item_ids[1]}")
    assert delete_resp.status_code == 200

    box_items_resp = client.get(f"/items/{box['id']}")
    assert box_items_resp.status_code == 200
    box_items = box_items_resp.json()
    assert len(box_items) == 2
    assert [item["box_position"] for item in box_items] == [1, 2]
    assert [item["name"] for item in box_items] == ["Item 0", "Item 2"]


def test_box_positions_account_for_quantity(client: TestClient):
    tab_resp = client.post("/tabs/", json={"name": "QtyTab"})
    assert tab_resp.status_code == 200
    tab = tab_resp.json()

    field_resp = client.post("/tab_fields/", json={"tab_id": tab["id"], "name": "Spec"})
    assert field_resp.status_code == 200

    box_resp = client.post(
        "/boxes/",
        json={
            "name": "Qty Box",
            "tab_id": tab["id"],
        },
    )
    assert box_resp.status_code == 200
    box = box_resp.json()

    payloads = [
        {"name": "Bulk", "qty": 5},
        {"name": "Medium", "qty": 3},
        {"name": "Single", "qty": 1},
    ]
    created = []
    for data in payloads:
        resp = client.post(
            "/items/",
            json={
                "name": data["name"],
                "tab_id": tab["id"],
                "box_id": box["id"],
                "qty": data["qty"],
                "metadata_json": {"Spec": data["name"]},
            },
        )
        assert resp.status_code == 200, resp.text
        created.append(resp.json())

    positions = [item["box_position"] for item in created]
    assert positions == [1, 6, 9]

    qty_update = client.put(f"/items/{created[1]['id']}", json={"qty": 4})
    assert qty_update.status_code == 200, qty_update.text
    
    refreshed = client.get(f"/items/{box['id']}")
    assert refreshed.status_code == 200
    refreshed_positions = [item["box_position"] for item in refreshed.json()]
    assert refreshed_positions == [1, 6, 10]

    boxes_resp = client.get(f"/boxes/{tab['id']}")
    assert boxes_resp.status_code == 200
    boxes_payload = boxes_resp.json()
    assert boxes_payload
    assert boxes_payload[0]["items_count"] == 9

def test_field_rename_preserves_item_metadata(client: TestClient):
    tab_resp = client.post("/tabs/", json={"name": "StableKeyTab"})
    assert tab_resp.status_code == 200
    tab = tab_resp.json()

    field_resp = client.post("/tab_fields/", json={"tab_id": tab["id"], "name": "Spec"})
    assert field_resp.status_code == 200
    field = field_resp.json()

    box_resp = client.post(
        "/boxes/",
        json={
            "name": "Stable Box",
            "tab_id": tab["id"],
            "description": None,
        },
    )
    assert box_resp.status_code == 200
    box = box_resp.json()

    item_resp = client.post(
        "/items/",
        json={
            "name": "Stable Item",
            "tab_id": tab["id"],
            "box_id": box["id"],
            "qty": 1,
            "metadata_json": {"Spec": "Value"},
        },
    )
    assert item_resp.status_code == 200, item_resp.text

    rename_resp = client.put(
        f"/tab_fields/{field['id']}",
        json={"name": "Specification"},
    )
    assert rename_resp.status_code == 200, rename_resp.text

    items_resp = client.get(f"/items/{box['id']}")
    assert items_resp.status_code == 200
    payload = items_resp.json()
    assert len(payload) == 1
    metadata = payload[0]["metadata_json"]
    assert metadata.get("Specification") == "Value"
    assert "Spec" not in metadata


def test_status_crud_roundtrip(client: TestClient):
    create_resp = client.post("/statuses/", json={"name": "Available", "color": "#22aa55"})
    assert create_resp.status_code == 200, create_resp.text
    status_payload = create_resp.json()
    assert status_payload["name"] == "Available"
    assert status_payload["color"] == "#22aa55"

    list_resp = client.get("/statuses/")
    assert list_resp.status_code == 200
    statuses = list_resp.json()
    assert any(status["name"] == "Available" for status in statuses)

    update_resp = client.put(
        f"/statuses/{status_payload['id']}", json={"name": "In Stock", "color": "#0088ff"}
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["name"] == "In Stock"
    assert updated["color"] == "#0088ff"

    delete_resp = client.delete(f"/statuses/{status_payload['id']}")
    assert delete_resp.status_code == 200
