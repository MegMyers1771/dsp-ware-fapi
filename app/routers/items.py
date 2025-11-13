from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Item
from typing import List
from app import schemas, database
from app.crud import items
from app.security import require_read_access, require_edit_access

router = APIRouter(prefix="/items", tags=["Items"], dependencies=[Depends(require_read_access)])



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



@router.post("/", response_model=schemas.ItemRead, dependencies=[Depends(require_edit_access)])
def create_item(item: schemas.ItemCreate, db: Session = Depends(database.get_db)):
    return items.create_item(db, item)

@router.get("/{box_id}", response_model=List[schemas.ItemRead])
def get_items(box_id: int, db: Session = Depends(database.get_db)):
    return items.get_items_by_box(db, box_id)

@router.put("/{item_id}", response_model=schemas.ItemRead, dependencies=[Depends(require_edit_access)])
def update_item(item_id: int, item_data: schemas.ItemUpdate, db: Session = Depends(database.get_db)):
    return items.update_item(db, item_id, item_data)

@router.delete("/{item_id}", dependencies=[Depends(require_edit_access)])
def delete_item(item_id: int, db: Session = Depends(database.get_db)):
    return items.delete_item(db, item_id)


@router.post("/{item_id}/issue", response_model=schemas.ItemUtilizedRead, dependencies=[Depends(require_edit_access)])
def issue_item(item_id: int, payload: schemas.ItemIssuePayload, db: Session = Depends(database.get_db)):
    return items.issue_item(db, item_id, payload)


@router.post("/reorder", response_model=List[schemas.ItemRead], dependencies=[Depends(require_edit_access)])
def reorder_items(payload: schemas.ItemReorderPayload, db: Session = Depends(database.get_db)):
    return items.reorder_items(db, payload.box_id, payload.ordered_ids)
