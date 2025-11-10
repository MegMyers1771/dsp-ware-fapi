from typing import Optional
from sqlalchemy.orm import Session
from app import models, schemas
from sqlalchemy import func
from fastapi import HTTPException


def _ensure_unique_box_name(db: Session, name: str, *, exclude_id: Optional[int] = None):
    query = db.query(models.Box).filter(func.lower(models.Box.name) == func.lower(name))
    if exclude_id is not None:
        query = query.filter(models.Box.id != exclude_id)

    existing = query.first()
    if existing:
        tab = db.query(models.Tab).filter(models.Tab.id == existing.tab_id).first()
        tab_name = getattr(tab, "name", f"#{existing.tab_id}")
        raise HTTPException(
            status_code=400,
            detail=f'Box "{existing.name}" уже существует в "{tab_name}"',
        )

def create_box(db: Session, box: schemas.BoxCreate):
    _ensure_unique_box_name(db, box.name)
    db_box = models.Box(**box.model_dump())
    db.add(db_box)
    db.commit()


    db.refresh(db_box)
    return db_box

def get_box(db: Session, box_id: int):
    return db.query(models.Box).filter(models.Box.id == box_id).first()

def update_box(db: Session, box_id: int, box_data: schemas.BoxUpdate):
    db_box = get_box(db, box_id)
    if not db_box:
        raise HTTPException(status_code=404, detail="Box not found")

    payload = box_data.model_dump(exclude_unset=True)

    if "name" in payload:
        _ensure_unique_box_name(db, payload["name"], exclude_id=box_id)

    for key, value in payload.items():
        setattr(db_box, key, value)

    db.commit()
    db.refresh(db_box)
    return db_box

def delete_box(db: Session, box_id: int):
    db_box = get_box(db, box_id)
    if not db_box:
        raise HTTPException(status_code=404, detail="Box not found")

    item_count = db.query(models.Item).filter(models.Item.box_id == box_id).count()
    if item_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete non-empty box")

    db.delete(db_box)
    db.commit()
    return {"detail": f"Box {box_id} deleted"}

def get_boxes(db: Session):
    """
    Возвращает список боксов с подсчитанным количеством айтемов в каждом.
    Используется SQL JOIN + GROUP BY для высокой производительности.
    """
    # 🔹 Подсчёт количества айтемов в каждом боксе одним запросом
    box_query = (
        db.query(
            models.Box.id,
            models.Box.name,
            models.Box.tab_id,
            models.Box.description,
            models.Box.tag_ids,
            func.count(models.Item.id).label("items_count")
        )
        .outerjoin(models.Item, models.Item.box_id == models.Box.id)
        .group_by(models.Box.id)
        .order_by(models.Box.id)
    )

    # 🔹 Формируем список словарей (для совместимости с Pydantic)
    return [
        {
            "id": b.id,
            "name": b.name,
            "tab_id": b.tab_id,
            "description": b.description,
            "tag_ids": b.tag_ids or [],
            "items_count": b.items_count,
        }
        for b in box_query.all()
    ]

def get_boxes_by_tab_id(db: Session, tab_id: int):
    """
    Возвращает все боксы, принадлежащие вкладке с указанным tab_id.
    Также добавляет в ответ количество айтемов в каждом боксе.
    """
    boxes = db.query(models.Box).filter(models.Box.tab_id == tab_id).all()

    # Подсчёт количества айтемов для каждого бокса
    result = []
    for box in boxes:
        items_count = db.query(models.Item).filter(models.Item.box_id == box.id).count()
        result.append({
            "id": box.id,
            "name": box.name,
            "tab_id": box.tab_id,
            "color": box.color,
            "description": box.description,
            "tag_ids": box.tag_ids or [],
            "items_count": items_count,
        })

    return result
