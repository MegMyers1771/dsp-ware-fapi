from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session


def ensure_unique_name(
    db: Session,
    model,
    name: str,
    entity_label: str,
    *,
    exclude_id: Optional[int] = None,
    extra_filters: Optional[Iterable] = None,
) -> None:
    """
    Validates that no other record of the given model uses the provided name.
    Case-insensitive comparison, optional scope filters, and ability to
    exclude the current record (for updates) are supported.
    """
    if not name:
        return

    query = db.query(model).filter(func.lower(model.name) == func.lower(name))

    if extra_filters:
        for clause in extra_filters:
            query = query.filter(clause)

    if exclude_id is not None:
        query = query.filter(model.id != exclude_id)

    if query.first():
        raise HTTPException(
            status_code=400,
            detail=f"{entity_label} с этим именем уже существует",
        )
