import pytest
from fastapi.testclient import TestClient
from app.main import app  # ← Импортируй свой FastAPI app

client = TestClient(app)


@pytest.fixture(scope="module")
def setup_data():
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


def test_create_items_with_tags(setup_data):
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



def test_search_by_tab_and_tag(setup_data):
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


def test_box_position_reorders_on_delete():
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
