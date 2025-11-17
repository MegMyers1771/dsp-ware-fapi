from typing import Dict, Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app import models, schemas
from app.crud.utils import ensure_unique_name


def _status_usage_counts(db: Session, status_ids: Optional[Iterable[int]] = None) -> Dict[int, int]:
    query = db.query(models.Issue.status_id, func.count(models.Issue.id))
    if status_ids is not None:
        status_ids = list(status_ids)
        if not status_ids:
            return {}
        query = query.filter(models.Issue.status_id.in_(status_ids))
    query = query.group_by(models.Issue.status_id)
    return {status_id: count for status_id, count in query.all()}


def _status_to_schema(status: models.Status, usage_count: int = 0) -> schemas.StatusRead:
    return schemas.StatusRead(
        id=status.id,
        name=status.name,
        color=status.color,
        usage_count=usage_count,
        can_delete=usage_count == 0,
    )


def create_status(db: Session, payload: schemas.StatusCreate):
    ensure_unique_name(db, models.Status, payload.name, "Статус")
    db_status = models.Status(**payload.model_dump())
    db.add(db_status)
    db.commit()
    db.refresh(db_status)
    return _status_to_schema(db_status)


def get_statuses(db: Session):
    statuses = db.query(models.Status).order_by(models.Status.name.asc()).all()
    usage_counts = _status_usage_counts(db)
    return [_status_to_schema(status, usage_counts.get(status.id, 0)) for status in statuses]


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
    usage_count = _status_usage_counts(db, [db_status.id]).get(db_status.id, 0)
    return _status_to_schema(db_status, usage_count)


def delete_status(db: Session, status_id: int):
    db_status = get_status(db, status_id)
    usage_count = _status_usage_counts(db, [status_id]).get(status_id, 0)
    if usage_count:
        raise HTTPException(status_code=400, detail="Статус нельзя удалить: он используется в истории выдач")
    db.delete(db_status)
    db.commit()
    return {"detail": f"Status {status_id} deleted"}
