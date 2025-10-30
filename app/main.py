from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.routers import items
from . import database, models, schemas

app = FastAPI(title="DSP-Ware API")
app.include_router(items.router)


models.Base.metadata.create_all(bind=database.engine)


# --- Вкладки ---
@app.post("/tabs/", response_model=schemas.TabRead)
def create_tab(tab: schemas.TabCreate, db: Session = Depends(database.get_db)):
    db_tab = models.Tab(name=tab.name, description=tab.description)
    db.add(db_tab)
    db.commit()
    db.refresh(db_tab)
    return db_tab


@app.get("/tabs", response_model=List[schemas.TabRead])
def get_tabs(db: Session = Depends(database.get_db)):
    tabs = db.query(models.Tab).all()
    result = []

    for tab in tabs:
        fields = db.query(models.TabField).filter(models.TabField.tab_id == tab.id).all()
        boxes_count = db.query(models.Box).filter(models.Box.tab_id == tab.id).count()

        result.append({
            "id": tab.id,
            "name": tab.name,
            "description": tab.description,
            "box_count": boxes_count,
            "fields": fields
        })

    return result

@app.get("/tabs/{tab_id}", response_model=schemas.TabRead)
def get_tab(tab_id: int, db: Session = Depends(database.get_db)):
    tab = db.query(models.Tab).filter(models.Tab.id == tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    fields = db.query(models.TabField).filter(models.TabField.tab_id == tab.id).all()
    boxes_count = db.query(models.Box).filter(models.Box.tab_id == tab.id).count()

    return {
        "id": tab.id,
        "name": tab.name,
        "description": tab.description,
        "box_count": boxes_count,
        "fields": fields
    }


# --- Ящики ---
@app.post("/boxes/", response_model=schemas.BoxRead)
def create_box(box: schemas.BoxCreate, db: Session = Depends(database.get_db)):
    db_box = models.Box(**box.dict())
    db.add(db_box)
    db.commit()
    db.refresh(db_box)

    # Автоматическое создание слотов
    if db_box.slot_count > 0:
        for i in range(1, db_box.slot_count + 1):
            slot = models.Slot(
                box_id=db_box.id,
                position=i,
                max_qty=db_box.capacity // db_box.slot_count if db_box.slot_count > 0 else db_box.capacity
            )
            db.add(slot)
        db.commit()

    db.refresh(db_box)
    return db_box


@app.get("/boxes/", response_model=list[schemas.BoxRead])
def list_boxes(db: Session = Depends(database.get_db)):
    return db.query(models.Box).all()


# # --- Слоты ---
# @app.post("/slots/", response_model=schemas.SlotRead)
# def create_slot(slot: schemas.SlotCreate, db: Session = Depends(database.get_db)):
#     box = db.query(models.Box).filter(models.Box.id == slot.box_id).first()
#     if not box:
#         raise HTTPException(status_code=404, detail="Box not found")

#     slot_count = db.query(models.Slot).filter(models.Slot.box_id == box.id).count()
#     if slot_count >= 10:
#         raise HTTPException(status_code=400, detail="Max 10 slots allowed")

#     new_slot = models.Slot(**slot.dict())
#     db.add(new_slot)
#     db.commit()
#     db.refresh(new_slot)
#     return new_slot


# @app.get("/slots/{box_id}", response_model=list[schemas.SlotRead])
# def list_slots(box_id: int, db: Session = Depends(database.get_db)):
#     return db.query(models.Slot).filter(models.Slot.box_id == box_id).all()


# --- Товары ---
@app.post("/items", response_model=schemas.ItemRead)
def create_item(item: schemas.ItemCreate, db: Session = Depends(database.get_db)):
    # 1. Проверяем, существует ли вкладка
    tab = db.query(models.Tab).filter(models.Tab.id == item.tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    # 2. Берем все поля вкладки
    fields = db.query(models.TabField).filter(models.TabField.tab_id == tab.id).all()
    if not fields:
        raise HTTPException(status_code=400, detail="Tab has no defined fields")

    # 3. Проверяем и дополняем metadata_json
    metadata = item.metadata_json.copy()
    for f in fields:
        # обязательные поля должны присутствовать
        if f.required and f.name not in metadata:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required field: {f.name}"
            )
        # если поле отсутствует — ставим значение по умолчанию
        if f.name not in metadata and f.default_value is not None:
            metadata[f.name] = f.default_value

    # 4. Создаем айтем
    new_item = models.Item(
        name=item.name,
        tab_id=item.tab_id,
        box_id=item.box_id,
        slot_id=item.slot_id,
        metadata_json=metadata
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return new_item

@app.get("/items/{box_id}", response_model=list[schemas.ItemRead])
def list_items(box_id: int, db: Session = Depends(database.get_db)):
    return db.query(models.Item).filter(models.Item.box_id == box_id).all()



@app.get("/tags/", response_model=List[schemas.TagRead])
def list_tags(db: Session = Depends(database.get_db)):
    return db.query(models.Tag).all()

@app.post("/tags/", response_model=schemas.TagRead)
def create_tag(tag: schemas.TagCreate, db: Session = Depends(database.get_db)):
    db_tag = models.Tag(**tag.dict())
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag

# @app.post("/tags/link/", response_model=schemas.TagLinkRead)
# def link_tag(link: schemas.TagLinkCreate, db: Session = Depends(database.get_db)):
#     db_tag = db.query(models.Tag).filter(models.Tag.id == link.tag_id).first()
#     if not db_tag:
#         raise HTTPException(status_code=404, detail="Tag not found")

#     db_link = models.TagLink(**link.dict())
#     db.add(db_link)
#     db.commit()
#     db.refresh(db_link)
#     return db_link


# @app.get("/tags/links/", response_model=List[schemas.TagLinkRead])
# def list_links(db: Session = Depends(database.get_db)):
#     return db.query(models.TagLink).all()

@app.post("/tab_fields/", response_model=schemas.TabFieldRead)
def create_tab_field(field: schemas.TabFieldCreate, db: Session = Depends(database.get_db)):
    tab = db.query(models.Tab).filter(models.Tab.id == field.tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    db_field = models.TabField(**field.dict())
    db.add(db_field)
    db.commit()
    db.refresh(db_field)
    return db_field


@app.get("/tab_fields/{tab_id}", response_model=List[schemas.TabFieldRead])
def list_tab_fields(tab_id: int, db: Session = Depends(database.get_db)):
    return db.query(models.TabField).filter(models.TabField.tab_id == tab_id).all()

