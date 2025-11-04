from sqlalchemy.orm import Session
from app import models, schemas
from fastapi import HTTPException

def create_tag(db: Session, tag: schemas.TagCreate):
    db_tag = models.Tag(**tag.dict())
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag

def get_tags(db: Session):
    return db.query(models.Tag).all()

def get_tag(db: Session, tag_id: int):
    return db.query(models.Tag).filter(models.Tag.id == tag_id).first()

def update_tag(db: Session, tag_id: int, tag_data: schemas.TagUpdate):
    db_tag = get_tag(db, tag_id)
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    for key, value in tag_data.dict(exclude_unset=True).items():
        setattr(db_tag, key, value)

    db.commit()
    db.refresh(db_tag)
    return db_tag

def delete_tag(db: Session, tag_id: int):
    db_tag = get_tag(db, tag_id)
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Проверяем, используется ли тег в айтемах
    used = db.query(models.Item).filter(models.Item.tag_id == tag_id).count()
    if used > 0:
        raise HTTPException(status_code=400, detail="Tag is used by items and cannot be deleted")

    db.delete(db_tag)
    db.commit()
    return {"detail": f"Tag {tag_id} deleted"}

