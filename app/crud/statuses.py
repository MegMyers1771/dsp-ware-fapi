from sqlalchemy.orm import Session
from fastapi import HTTPException
from app import models, schemas
from app.crud.utils import ensure_unique_name


def create_status(db: Session, payload: schemas.StatusCreate):
    ensure_unique_name(db, models.Status, payload.name, "Статус")
    db_status = models.Status(**payload.model_dump())
    db.add(db_status)
    db.commit()
    db.refresh(db_status)
    return db_status


def get_statuses(db: Session):
    return db.query(models.Status).order_by(models.Status.name.asc()).all()


def get_status(db: Session, status_id: int):
    status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if not status:
        raise HTTPException(status_code=404, detail="Status not found")
    return status


def update_status(db: Session, status_id: int, data: schemas.StatusUpdate):
    db_status = get_status(db, status_id)
    payload = data.model_dump(exclude_unset=True)

    if "name" in payload:
        ensure_unique_name(
            db,
            models.Status,
            payload["name"],
            "Статус",
            exclude_id=status_id,
        )

    for key, value in payload.items():
        setattr(db_status, key, value)

    db.commit()
    db.refresh(db_status)
    return db_status


def delete_status(db: Session, status_id: int):
    db_status = get_status(db, status_id)
    db.delete(db_status)
    db.commit()
    return {"detail": f"Status {status_id} deleted"}
