from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app import schemas, database
from app.crud import fields as tab_fields

router = APIRouter(prefix="/tab_fields", tags=["Tab Fields"])


@router.post("/", response_model=schemas.TabFieldRead)
def create_tab_field(
    field: schemas.TabFieldCreate,
    db: Session = Depends(database.get_db)
):
    """Создание поля вкладки."""
    return tab_fields.create_tab_field(db, field)


@router.get("/{tab_id}", response_model=List[schemas.TabFieldRead])
def list_tab_fields(tab_id: int, db: Session = Depends(database.get_db)):
    """Получение всех полей конкретной вкладки."""
    return tab_fields.get_tab_fields(db, tab_id)

@router.put("/{field_id}", response_model=schemas.TabFieldRead)
def update_tab_field(field_id: int, field_data: schemas.TabFieldUpdate, db: Session = Depends(database.get_db)):
    return tab_fields.update_tab_field(db, field_id, field_data)

@router.delete("/{field_id}")
def delete_tab_field(field_id: int, db: Session = Depends(database.get_db)):
    return tab_fields.delete_tab_field(db, field_id)