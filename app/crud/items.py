from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException
from app import models, schemas


def create_item(db: Session, item: schemas.ItemCreate):
    tab = db.query(models.Tab).filter(models.Tab.id == item.tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    fields = db.query(models.TabField).filter(models.TabField.tab_id == tab.id).all()
    if not fields:
        raise HTTPException(status_code=400, detail="Tab has no defined fields")
    
    if not item.position:
        raise HTTPException(status_code=400, detail="Position is required")

    metadata = item.metadata_json.copy()
    
    for f in fields:
        # if f.required and f.name not in metadata:
        #     raise HTTPException(status_code=400, detail=f"Missing required field: {f.name}")
        if f.name not in metadata and f.default_value is not None:
            metadata[f.name] = f.default_value

    new_item = models.Item(
        name=item.name,
        tab_id=item.tab_id,
        box_id=item.box_id,
        tag_id=item.tag_id,
        slot_id=item.slot_id,
        metadata_json=metadata
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

def search_items(db: Session, query: str, tab_id: int, limit: int = 100):
    """
    Ищет айтемы по названию в заданной вкладке.
    Возвращает список объектов с данными по ящику и тегу.
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
        .options(
            selectinload(models.Item.box),
            selectinload(models.Item.tag)
        )
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
            "tag_id": item.tag_id,
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

    for key, value in item_data.dict(exclude_unset=True).items():
        setattr(db_item, key, value)

    db.commit()
    db.refresh(db_item)
    return db_item

def delete_item(db: Session, item_id: int):
    db_item = get_item(db, item_id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(db_item)
    db.commit()
    return {"detail": f"Item {item_id} deleted"}

def get_items_by_box(db: Session, box_id: int):
    return db.query(models.Item).filter(models.Item.box_id == box_id).all()

