from sqlalchemy.orm import Session
from fastapi import HTTPException
from app import models, schemas


def create_tab_field(db: Session, field: schemas.TabFieldCreate):
    """Создаёт новое поле для вкладки."""
    tab = db.query(models.Tab).filter(models.Tab.id == field.tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    db_field = models.TabField(**field.model_dump())
    db.add(db_field)
    db.commit()
    db.refresh(db_field)
    return db_field


def get_tab_fields(db: Session, tab_id: int):
    """Возвращает все поля, принадлежащие вкладке."""
    return db.query(models.TabField).filter(models.TabField.tab_id == tab_id).all()

def get_field(db: Session, field_id: int):
    return db.query(models.TabField).filter(models.TabField.id == field_id).first()

def update_tab_field(db: Session, field_id: int, field_data: schemas.TabFieldUpdate):
    db_field = get_field(db, field_id)
    if not db_field:
        raise HTTPException(status_code=404, detail="Tab field not found")

    for key, value in field_data.dict(exclude_unset=True).items():
        setattr(db_field, key, value)

    db.commit()
    db.refresh(db_field)
    return db_field

def delete_tab_field(db: Session, field_id: int):
    db_field = get_field(db, field_id)
    if not db_field:
        raise HTTPException(status_code=404, detail="Tab field not found")

    db.delete(db_field)
    db.commit()
    return {"detail": f"Tab field {field_id} deleted"}
