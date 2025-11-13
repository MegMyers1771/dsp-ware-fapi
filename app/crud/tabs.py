from sqlalchemy.orm import Session
from app import models, schemas
from fastapi import HTTPException
from app.crud.utils import ensure_unique_name

def create_tab(db: Session, tab: schemas.TabCreate):
    ensure_unique_name(db, models.Tab, tab.name, "Tab")
    db_tab = models.Tab(**tab.model_dump())
    db.add(db_tab)
    db.commit()
    db.refresh(db_tab)
    return db_tab

def get_tabs(db: Session):
    tabs = db.query(models.Tab).all()
    result = []
    for tab in tabs:
        fields = db.query(models.TabField).filter(models.TabField.tab_id == tab.id).all()
        boxes_count = db.query(models.Box).filter(models.Box.tab_id == tab.id).count()
        result.append({
            "id": tab.id,
            "name": tab.name,
            "box_count": boxes_count,
            "description": tab.description,
            "fields": fields,
            "tag_ids": tab.tag_ids or [],
            "enable_pos": bool(tab.enable_pos),
        })
    return result

def update_tab(db: Session, tab_id: int, tab_data: schemas.TabUpdate):
    db_tab = db.query(models.Tab).filter(models.Tab.id == tab_id).first()
    if not db_tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    payload = tab_data.model_dump(exclude_unset=True)

    if "name" in payload:
        ensure_unique_name(
            db,
            models.Tab,
            payload["name"],
            "Вкладка",
            exclude_id=tab_id,
        )

    for key, value in payload.items():
        setattr(db_tab, key, value)

    db.commit()
    db.refresh(db_tab)
    return db_tab

def get_tab(db: Session, tab_id: int):
    tab = db.query(models.Tab).filter(models.Tab.id == tab_id).first()
    if not tab:
        return None
    fields = db.query(models.TabField).filter(models.TabField.tab_id == tab.id).all()
    boxes_count = db.query(models.Box).filter(models.Box.tab_id == tab.id).count()
    
    return {
        "id": tab.id,
        "name": tab.name,
        "description": tab.description,
        "box_count": boxes_count,
        "fields": fields,
        "tag_ids": tab.tag_ids or [],
        "enable_pos": bool(tab.enable_pos),
    }


def delete_tab(db: Session, tab_id: int):
    tab = db.query(models.Tab).filter(models.Tab.id == tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    # Проверка количества айтемов
    # item_count = db.query(models.Item).filter(models.Item.tab_id == tab_id).count()
    # if item_count >= 100:
    #     raise HTTPException(status_code=400, detail="Tab cannot be deleted (contains 100+ items)")

    db.delete(tab)
    db.commit()
    return {"detail": "Tab deleted successfully"}
