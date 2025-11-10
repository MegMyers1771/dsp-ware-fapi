from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Item
from typing import List
from app import schemas, database
from app.crud import items

router = APIRouter(prefix="/items", tags=["Items"])



@router.get("/search")
def search_items(
    query: str = Query(..., description="Строка поиска (например, 'DDR4')"),
    tab_id: int = Query(..., description="ID вкладки (например, 1 — 'ОЗУ')"),
    limit: int = Query(100, description="Максимум элементов в ответе"),
    db: Session = Depends(database.get_db)
):
    """
    Быстрый поиск по названию айтема внутри вкладки.
    Возвращает совпадения с информацией о ящике и теге.
    """
    results = items.search_items(db, query=query, tab_id=tab_id, limit=limit)
    return {"results": results, "count": len(results)}



@router.post("/", response_model=schemas.ItemRead)
def create_item(item: schemas.ItemCreate, db: Session = Depends(database.get_db)):
    return items.create_item(db, item)

@router.get("/{box_id}", response_model=List[schemas.ItemRead])
def get_items(box_id: int, db: Session = Depends(database.get_db)):
    return items.get_items_by_box(db, box_id)

@router.put("/{item_id}", response_model=schemas.ItemRead)
def update_item(item_id: int, item_data: schemas.ItemUpdate, db: Session = Depends(database.get_db)):
    return items.update_item(db, item_id, item_data)

@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(database.get_db)):
    return items.delete_item(db, item_id)


@router.post("/reorder", response_model=List[schemas.ItemRead])
def reorder_items(payload: schemas.ItemReorderPayload, db: Session = Depends(database.get_db)):
    return items.reorder_items(db, payload.box_id, payload.ordered_ids)
