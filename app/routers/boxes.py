from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app import schemas, database
from app.crud import boxes
from fastapi.exceptions import HTTPException

router = APIRouter(prefix="/boxes", tags=["Boxes"])

@router.post("/", response_model=schemas.BoxRead)
def create_box(box: schemas.BoxCreate, db: Session = Depends(database.get_db)):
    return boxes.create_box(db, box)

@router.get("/", response_model=List[schemas.BoxRead])
def get_boxes(db: Session = Depends(database.get_db)):
    return boxes.get_boxes(db)

@router.get("/{tab_id}", response_model=List[schemas.BoxRead])
def read_boxes_by_tab(tab_id: int, db: Session = Depends(database.get_db)):
    """
    Получить все боксы, относящиеся к указанной вкладке.
    """
    boxes_list = boxes.get_boxes_by_tab_id(db, tab_id)
    if not boxes_list:
        raise HTTPException(status_code=404, detail="No boxes found for this tab")
    return boxes_list

@router.put("/{box_id}", response_model=schemas.BoxRead)
def update_box(box_id: int, box_data: schemas.BoxUpdate, db: Session = Depends(database.get_db)):
    return boxes.update_box(db, box_id, box_data)

@router.delete("/{box_id}")
def delete_box(box_id: int, db: Session = Depends(database.get_db)):
    return boxes.delete_box(db, box_id)
