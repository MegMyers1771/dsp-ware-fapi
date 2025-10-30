from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Item
from typing import List

router = APIRouter(prefix="/items", tags=["Items"])



@router.get("/search")
def search_items(
    query: str = Query(..., description="Строка поиска (например, 'DDR4')"),
    tab_id: int = Query(..., description="ID вкладки (например, 1 — 'ОЗУ')"),
    limit: int = Query(100, description="Максимум элементов в ответе"),
    db: Session = Depends(get_db)
):
    """
    Быстрый поиск по названию айтема внутри вкладки.
    Возвращает только совпадения с тегами и ящиками.
    """

    # 🔹 1. Ищем только ID айтемов по названию
    matching_items = (
        db.query(Item.id)
        .filter(Item.tab_id == tab_id)
        .filter(Item.name.ilike(f"%{query}%"))
        .limit(limit)
        .all()
    )

    if not matching_items:
        return {"results": []}

    item_ids = [i.id for i in matching_items]

    # 🔹 2. Подтягиваем найденные айтемы с тегами и ящиками
    results = (
        db.query(Item)
        .options(
            selectinload(Item.tags),
            selectinload(Item.box)
        )
        .filter(Item.id.in_(item_ids))
        .all()
    )

    # 🔹 3. Собираем удобный JSON-ответ
    response = [
        {
            "id": item.id,
            "name": item.name,
            "box": {
                "id": item.box.id,
                "name": item.box.name,
                "color": item.box.color if hasattr(item.box, "color") else None
            } if item.box else None,
            "tags": [
                {"id": t.id, "name": t.name, "color": t.color}
                for t in item.tags
            ],
        }
        for item in results
    ]

    return {"results": response, "count": len(response)}
