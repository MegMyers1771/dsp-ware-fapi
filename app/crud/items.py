from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException
from app import models, schemas


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

    fields = db.query(models.TabField).filter(models.TabField.tab_id == tab.id).all()
    if not fields:
        raise HTTPException(status_code=400, detail="Tab has no defined fields")
    
    if not item.position:
        raise HTTPException(status_code=400, detail="Position is required")

    if not item.box_id:
        raise HTTPException(status_code=400, detail="Box is required")

    metadata = (item.metadata_json or {}).copy()
    
    for f in fields:
        # if f.required and f.name not in metadata:
        #     raise HTTPException(status_code=400, detail=f"Missing required field: {f.name}")
        if f.name not in metadata and f.default_value is not None:
            metadata[f.name] = f.default_value

    next_position = _get_next_box_position(db, item.box_id)

    new_item = models.Item(
        name=item.name,
        tab_id=item.tab_id,
        box_id=item.box_id,
        metadata_json=metadata,
        box_position=next_position,
        tag_ids=list(item.tag_ids or []),
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

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
            "metadata": item.metadata_json
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

    payload = item_data.dict(exclude_unset=True)
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

    for key, value in payload.items():
        setattr(db_item, key, value)

    if box_changed:
        db_item.box_position = next_position

    db.commit()
    db.refresh(db_item)
    return db_item

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

def get_items_by_box(db: Session, box_id: int):
    return (
        db.query(models.Item)
        .filter(models.Item.box_id == box_id)
        .order_by(models.Item.box_position.asc())
        .all()
    )
