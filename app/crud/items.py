from typing import Any, Dict, List, Optional
from datetime import datetime, UTC
import json
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException
from app import models, schemas


def _get_tab_fields(db: Session, tab_id: int, *, required: bool = False) -> List[models.TabField]:
    fields = db.query(models.TabField).filter(models.TabField.tab_id == tab_id).all()
    if required and not fields:
        raise HTTPException(status_code=400, detail="Tab has no defined fields")
    return fields


def _build_field_maps(fields: List[models.TabField]):
    name_map = {}
    key_map = {}
    for field in fields or []:
        stable_key = getattr(field, "stable_key", None) or field.name
        name_map[field.name] = field
        key_map[stable_key] = field
    return name_map, key_map


def _metadata_to_storage(metadata_json: Optional[Dict[str, Any]], fields: List[models.TabField]) -> Dict[str, Any]:
    metadata_json = metadata_json or {}
    if not metadata_json:
        return {}

    name_map, key_map = _build_field_maps(fields)
    if not name_map and not key_map:
        return metadata_json.copy()

    normalized: Dict[str, Any] = {}
    unknown_keys = []

    for raw_key, value in metadata_json.items():
        field = name_map.get(raw_key) or key_map.get(raw_key)
        if not field:
            unknown_keys.append(raw_key)
            continue
        stable_key = getattr(field, "stable_key", None) or field.name
        normalized[stable_key] = value

    if unknown_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown tab fields: {', '.join(unknown_keys)}",
        )

    return normalized


def _metadata_to_response(metadata_json: Optional[Dict[str, Any]], fields: List[models.TabField]) -> Dict[str, Any]:
    metadata_json = metadata_json or {}
    if not metadata_json:
        return {}

    key_to_name = {}
    for field in fields or []:
        stable_key = getattr(field, "stable_key", None) or field.name
        key_to_name[stable_key] = field.name

    converted: Dict[str, Any] = {}
    for raw_key, value in metadata_json.items():
        display_key = key_to_name.get(raw_key, raw_key)
        converted[display_key] = value

    return converted


def _item_to_schema(item: models.Item, fields: List[models.TabField]) -> schemas.ItemRead:
    return schemas.ItemRead(
        id=item.id,
        name=item.name,
        qty=item.qty,
        position=item.box_position,
        metadata_json=_metadata_to_response(item.metadata_json, fields),
        tag_ids=list(item.tag_ids or []),
        tab_id=item.tab_id,
        box_id=item.box_id,
        box_position=item.box_position,
    )


def _serialize_items(db: Session, items: List[models.Item]) -> List[schemas.ItemRead]:
    if not items:
        return []

    fields_cache: Dict[int, List[models.TabField]] = {}
    serialized: List[schemas.ItemRead] = []
    for item in items:
        if item.tab_id not in fields_cache:
            fields_cache[item.tab_id] = _get_tab_fields(db, item.tab_id)
        serialized.append(_item_to_schema(item, fields_cache[item.tab_id]))
    return serialized


def _get_next_box_position(db: Session, box_id: int) -> int:
    max_position = (
        db.query(func.max(models.Item.box_position))
        .filter(models.Item.box_id == box_id)
        .scalar()
    )
    return (max_position or 0) + 1


def _compress_box_positions(db: Session, box_id: int, from_position: int) -> None:
    db.query(models.Item).filter(
        models.Item.box_id == box_id,
        models.Item.box_position > from_position,
    ).update(
        {models.Item.box_position: models.Item.box_position - 1},
        synchronize_session=False,
    )


def create_item(db: Session, item: schemas.ItemCreate):
    tab = db.query(models.Tab).filter(models.Tab.id == item.tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    fields = _get_tab_fields(db, tab.id, required=True)
    
    if not item.position:
        raise HTTPException(status_code=400, detail="Position is required")

    if not item.box_id:
        raise HTTPException(status_code=400, detail="Box is required")

    metadata = _metadata_to_storage(item.metadata_json, fields)
    
    for f in fields:
        # if f.required and f.name not in metadata:
        #     raise HTTPException(status_code=400, detail=f"Missing required field: {f.name}")
        default_value = getattr(f, "default_value", None)
        stable_key = getattr(f, "stable_key", None) or f.name
        if stable_key not in metadata and default_value is not None:
            metadata[stable_key] = default_value

    next_position = _get_next_box_position(db, item.box_id)

    new_item = models.Item(
        name=item.name,
        qty=item.qty,
        tab_id=item.tab_id,
        box_id=item.box_id,
        metadata_json=metadata,
        box_position=next_position,
        tag_ids=list(item.tag_ids or []),
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return _item_to_schema(new_item, fields)

def search_items(db: Session, query: str, tab_id: int, limit: int = 100):
    """
    Ищет айтемы по названию в заданной вкладке.
    Возвращает список объектов с данными по ящику и прикреплённым тегам.
    """

    # 🔹 1. Ищем только ID совпадений по названию
    matching_items = (
        db.query(models.Item.id)
        .filter(models.Item.tab_id == tab_id)
        .filter(models.Item.name.ilike(f"%{query}%"))
        .limit(limit)
        .all()
    )

    if not matching_items:
        return []

    item_ids = [i.id for i in matching_items]

    # 🔹 2. Подтягиваем найденные айтемы с боксами и тегами
    results = (
        db.query(models.Item)
        .options(selectinload(models.Item.box))
        .filter(models.Item.id.in_(item_ids))
        .all()
    )

    # 🔹 3. Составляем JSON-ответ
    fields = _get_tab_fields(db, tab_id)

    response = [
        {
            "id": item.id,
            "name": item.name,
            "box": {
                "id": item.box.id,
                "name": item.box.name,
                "color": getattr(item.box, "color", None)
            } if item.box else None,
            "tag_ids": item.tag_ids or [],
            "metadata": _metadata_to_response(item.metadata_json, fields)
        }
        for item in results
    ]

    return response 

def get_item(db: Session, item_id: int):
    return db.query(models.Item).filter(models.Item.id == item_id).first()

def update_item(db: Session, item_id: int, item_data: schemas.ItemUpdate):
    db_item = get_item(db, item_id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    payload = item_data.model_dump(exclude_unset=True)
    payload.pop("box_position", None)
    if "tag_ids" in payload and payload["tag_ids"] is not None:
        payload["tag_ids"] = list(payload["tag_ids"])

    old_box_id = db_item.box_id
    old_position = db_item.box_position
    new_box_id = payload.get("box_id", old_box_id)
    box_changed = new_box_id != old_box_id

    next_position = db_item.box_position
    if box_changed:
        _compress_box_positions(db, old_box_id, old_position)
        next_position = _get_next_box_position(db, new_box_id)

    tab_fields: Optional[List[models.TabField]] = None
    if "metadata_json" in payload:
        tab_fields = _get_tab_fields(db, db_item.tab_id, required=True)
        payload["metadata_json"] = _metadata_to_storage(payload["metadata_json"], tab_fields)

    for key, value in payload.items():
        setattr(db_item, key, value)

    if box_changed:
        db_item.box_position = next_position

    db.commit()
    db.refresh(db_item)
    if tab_fields is None:
        tab_fields = _get_tab_fields(db, db_item.tab_id)
    return _item_to_schema(db_item, tab_fields)

def delete_item(db: Session, item_id: int):
    db_item = get_item(db, item_id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    box_id = db_item.box_id
    deleted_position = db_item.box_position

    db.delete(db_item)
    _compress_box_positions(db, box_id, deleted_position)
    db.commit()
    return {"detail": f"Item {item_id} deleted"}


def issue_item(db: Session, item_id: int, payload: schemas.ItemIssuePayload):
    db_item = (
        db.query(models.Item)
        .options(selectinload(models.Item.box), selectinload(models.Item.tab))
        .filter(models.Item.id == item_id)
        .first()
    )
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    status = db.query(models.Status).filter(models.Status.id == payload.status_id).first()
    if not status:
        raise HTTPException(status_code=404, detail="Status not found")

    current_qty = db_item.qty or 0
    if current_qty <= 0:
        raise HTTPException(status_code=400, detail="Item has no remaining quantity")

    snapshot = json.dumps(
        {
            "item_name": db_item.name,
            "tab_name": getattr(db_item.tab, "name", None),
            "box_name": getattr(db_item.box, "name", None),
        },
        ensure_ascii=False,
    )

    user = (
        db.query(models.User)
        .filter(models.User.email == payload.responsible_email.lower())
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Ответственный пользователь не найден")

    issue = models.Issue(status_id=status.id)
    serial_number = (payload.serial_number or "").strip() or None
    invoice_number = (payload.invoice_number or "").strip() or None
    item_utilized = models.ItemUtilized(
        issue=issue,
        item_snapshot=snapshot,
        serial_number=serial_number,
        invoice_number=invoice_number,
        responsible_user_id=user.id,
    )

    db.add(item_utilized)

    should_delete = current_qty <= 1
    box_id = db_item.box_id
    deleted_position = db_item.box_position

    if should_delete:
        db.delete(db_item)
        _compress_box_positions(db, box_id, deleted_position)
    else:
        db_item.qty = current_qty - 1

    db.commit()
    db.refresh(item_utilized)
    return item_utilized

def get_items_by_box(db: Session, box_id: int):
    items = (
        db.query(models.Item)
        .filter(models.Item.box_id == box_id)
        .order_by(models.Item.box_position.asc())
        .all()
    )
    return _serialize_items(db, items)


def reorder_items(db: Session, box_id: int, ordered_ids: List[int]):
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="ordered_ids must not be empty")

    items_in_box = (
        db.query(models.Item)
        .filter(models.Item.box_id == box_id)
        .order_by(models.Item.box_position.asc())
        .all()
    )

    if not items_in_box:
        raise HTTPException(status_code=404, detail="Box has no items to reorder")

    existing_ids = [item.id for item in items_in_box]
    if len(existing_ids) != len(ordered_ids):
        raise HTTPException(status_code=400, detail="ordered_ids count mismatch")

    if set(existing_ids) != set(ordered_ids):
        raise HTTPException(status_code=400, detail="ordered_ids must include every item in box exactly once")

    id_to_item = {item.id: item for item in items_in_box}

    for position, item_id in enumerate(ordered_ids, start=1):
        id_to_item[item_id].box_position = position

    db.commit()

    items_in_box.sort(key=lambda item: item.box_position)
    return _serialize_items(db, items_in_box)
