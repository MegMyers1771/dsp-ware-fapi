from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app import schemas, database
from app.crud import statuses as status_crud
from app.security import require_read_access, require_edit_access

router = APIRouter(prefix="/statuses", tags=["Statuses"], dependencies=[Depends(require_read_access)])


@router.post("/", response_model=schemas.StatusRead, dependencies=[Depends(require_edit_access)])
def create_status(status: schemas.StatusCreate, db: Session = Depends(database.get_db)):
    return status_crud.create_status(db, status)


@router.get("/", response_model=List[schemas.StatusRead])
def list_statuses(db: Session = Depends(database.get_db)):
    return status_crud.get_statuses(db)


@router.put("/{status_id}", response_model=schemas.StatusRead, dependencies=[Depends(require_edit_access)])
def update_status(status_id: int, status_data: schemas.StatusUpdate, db: Session = Depends(database.get_db)):
    return status_crud.update_status(db, status_id, status_data)


@router.delete("/{status_id}", dependencies=[Depends(require_edit_access)])
def delete_status(status_id: int, db: Session = Depends(database.get_db)):
    return status_crud.delete_status(db, status_id)
