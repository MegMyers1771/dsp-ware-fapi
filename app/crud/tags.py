from collections import defaultdict
from sqlalchemy.orm import Session
from app import models, schemas
from fastapi import HTTPException
from typing import Dict, Optional, Iterable, List
from app.crud.utils import ensure_unique_name

ENTITY_MODELS = {
    "tab_id": (models.Tab, "Tab"),
    "box_id": (models.Box, "Box"),
    "item_id": (models.Item, "Item"),
}


def _get_entity(db: Session, key: str, entity_id: int, required: bool = True):
    model, label = ENTITY_MODELS[key]
    entity = db.query(model).filter(model.id == entity_id).first()
    if not entity and required:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return entity


def _add_tag_to_entity(entity, tag_id: int):
    if entity is None:
        return
    tag_ids = list(entity.tag_ids or [])
    if tag_id not in tag_ids:
        tag_ids.append(tag_id)
        entity.tag_ids = tag_ids


def _remove_tag_from_entity(entity, tag_id: int):
    if entity is None:
        return
    tag_ids = list(entity.tag_ids or [])
    if tag_id in tag_ids:
        tag_ids.remove(tag_id)
        entity.tag_ids = tag_ids


def _attach_to_entities(db: Session, tag_id: int, link_payload: Dict[str, Optional[int]]):
    for key, entity_id in link_payload.items():
        if key not in ENTITY_MODELS or entity_id is None:
            continue
        entity = _get_entity(db, key, entity_id)
        _add_tag_to_entity(entity, tag_id)


def _detach_from_entities(db: Session, tag_id: int, link_payload: Dict[str, Optional[int]]):
    for key, entity_id in link_payload.items():
        if key not in ENTITY_MODELS or entity_id is None:
            continue
        entity = _get_entity(db, key, entity_id, required=False)
        _remove_tag_from_entity(entity, tag_id)


def _remove_tag_from_all_entities(db: Session, tag_id: int):
    for model, _ in ENTITY_MODELS.values():
        entities = db.query(model).all()
        for entity in entities:
            _remove_tag_from_entity(entity, tag_id)


def _collect_tag_bindings(db: Session, filter_ids: Optional[Iterable[int]] = None):
    filter_set = set(filter_ids) if filter_ids else None
    bindings = defaultdict(lambda: {"tabs": [], "boxes": [], "items": []})

    def add_binding(tag_id: int, bucket: str, value: int):
        if filter_set and tag_id not in filter_set:
            return
        bindings[tag_id][bucket].append(value)

    for tab in db.query(models.Tab).all():
        for tag_id in tab.tag_ids or []:
            add_binding(tag_id, "tabs", tab.id)

    for box in db.query(models.Box).all():
        for tag_id in box.tag_ids or []:
            add_binding(tag_id, "boxes", box.id)

    for item in db.query(models.Item).all():
        for tag_id in item.tag_ids or []:
            add_binding(tag_id, "items", item.id)

    return bindings


def _tag_to_schema(db_tag: models.Tag, bindings: Dict[int, Dict[str, List[int]]]):
    binding_entry = bindings.get(db_tag.id, {"tabs": [], "boxes": [], "items": []})
    return schemas.TagRead(
        id=db_tag.id,
        name=db_tag.name,
        color=db_tag.color,
        tab_id=None,
        box_id=None,
        item_id=None,
        attached_tabs=binding_entry["tabs"],
        attached_boxes=binding_entry["boxes"],
        attached_items=binding_entry["items"],
    )


def _reset_legacy_links(db_tag: models.Tag):
    for key in ENTITY_MODELS.keys():
        setattr(db_tag, key, None)


def create_tag(db: Session, tag: schemas.TagCreate):
    ensure_unique_name(db, models.Tag, tag.name, "Тэг")
    payload = tag.model_dump()
    link_payload = {k: payload.pop(k) for k in ENTITY_MODELS.keys()}

    db_tag = models.Tag(**payload)
    db.add(db_tag)
    db.flush()  # получить ID до коммита
    _attach_to_entities(db, db_tag.id, link_payload)
    _reset_legacy_links(db_tag)
    db.commit()
    db.refresh(db_tag)
    bindings = _collect_tag_bindings(db, [db_tag.id])
    return _tag_to_schema(db_tag, bindings)


def attach_tag(db: Session, tag_id: int, link_data: schemas.TagLinkPayload):
    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    payload = link_data.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nothing to attach")

    _attach_to_entities(db, db_tag.id, payload)
    _reset_legacy_links(db_tag)
    db.commit()
    db.refresh(db_tag)
    bindings = _collect_tag_bindings(db, [db_tag.id])
    return _tag_to_schema(db_tag, bindings)


def get_tags(db: Session):
    db_tags = db.query(models.Tag).all()
    bindings = _collect_tag_bindings(db)
    return [_tag_to_schema(tag, bindings) for tag in db_tags]


def update_tag(db: Session, tag_id: int, tag_data: schemas.TagUpdate):
    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    payload = tag_data.model_dump(exclude_unset=True)

    if "name" in payload:
        ensure_unique_name(
            db,
            models.Tag,
            payload["name"],
            "Tag",
            exclude_id=tag_id,
        )

    link_payload = {k: payload.pop(k) for k in list(payload.keys()) if k in ENTITY_MODELS}

    for key, value in payload.items():
        setattr(db_tag, key, value)

    if link_payload:
        _attach_to_entities(db, db_tag.id, link_payload)

    _reset_legacy_links(db_tag)
    db.commit()
    db.refresh(db_tag)
    bindings = _collect_tag_bindings(db, [db_tag.id])
    return _tag_to_schema(db_tag, bindings)


def delete_tag(db: Session, tag_id: int):
    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    _remove_tag_from_all_entities(db, db_tag.id)
    db.delete(db_tag)
    db.commit()
    return {"detail": f"Tag {tag_id} deleted"}


def detach_tag(db: Session, tag_id: int, link_data: schemas.TagLinkPayload):
    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    payload = link_data.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nothing to detach")

    _detach_from_entities(db, db_tag.id, payload)
    db.commit()
    db.refresh(db_tag)
    bindings = _collect_tag_bindings(db, [db_tag.id])
    return _tag_to_schema(db_tag, bindings)
