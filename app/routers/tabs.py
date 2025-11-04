from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import schemas, database
from app.crud import tabs

router = APIRouter(prefix="/tabs", tags=["Tabs"])

@router.post("/", response_model=schemas.TabRead)
def create_tab(tab: schemas.TabCreate, db: Session = Depends(database.get_db)):
    return tabs.create_tab(db, tab)

@router.get("/", response_model=List[schemas.TabRead])
def get_tabs(db: Session = Depends(database.get_db)):
    return tabs.get_tabs(db)

@router.get("/{tab_id}", response_model=schemas.TabRead)
def get_tab(tab_id: int, db: Session = Depends(database.get_db)):
    tab = tabs.get_tab(db, tab_id)
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    return tab

@router.put("/{tab_id}", response_model=schemas.TabRead)
def update_tab(tab_id: int, tab_data: schemas.TabUpdate, db: Session = Depends(database.get_db)):
    return tabs.update_tab(db, tab_id, tab_data)

@router.delete("/{tab_id}")
def delete_tab(tab_id: int, db: Session = Depends(database.get_db)):
    return tabs.delete_tab(db, tab_id)
