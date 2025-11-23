from __future__ import annotations

from typing import Any, Dict, List

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.utils import parser_storage


def import_parsed_tab(db: Session, tab_name: str) -> schemas.ParserImportResult:
    data, source_path = parser_storage.load_parsed_file(tab_name)
    tab_display_name = parser_storage.resolve_tab_name(data, source_path.stem)
    if not tab_display_name:
        raise HTTPException(status_code=400, detail="Не удалось определить название вкладки")

    existing = (
        db.query(models.Tab)
        .filter(func.lower(models.Tab.name) == func.lower(tab_display_name))
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Вкладка «{tab_display_name}» уже существует")

    allowed_values = parser_storage.normalize_allowed_map(data.get("reserved"))
    field_names = [str(name).strip() for name in data.get("fields") or [] if str(name).strip()]
    boxes_data = data.get("boxes") or []
    enable_pos = bool(data.get("enable_pos", True))

    parser_storage.ensure_required_fields(field_names)

    if not field_names:
        raise HTTPException(status_code=400, detail="В файле отсутствует список полей вкладки")

    try:
        tab = models.Tab(name=tab_display_name, description=None, enable_pos=enable_pos, tag_ids=[])
        db.add(tab)
        db.flush()

        created_fields: List[models.TabField] = []
        for field_name in field_names:
            if parser_storage.is_core_name_field(field_name) or parser_storage.is_core_qty_field(field_name):
                continue
            allowed = parser_storage.match_allowed_values(field_name, allowed_values)
            db_field = models.TabField(
                tab_id=tab.id,
                name=field_name,
                allowed_values=allowed or None,
                strong=False,
            )
            db.add(db_field)
            created_fields.append(db_field)

        db.flush()
        field_lookup = {field.name: field for field in created_fields}

        created_boxes = 0
        created_items = 0
        existing_box_names = {
            name.lower()
            for (name,) in db.query(models.Box.name).all()
        }

        for box_entry in boxes_data:
            box_name = str(box_entry.get("box") or "").strip()
            if not box_name:
                continue

            if box_name.lower() in existing_box_names:
                raise HTTPException(
                    status_code=400,
                    detail=f"Бокс с названием «{box_name}» уже существует",
                )

            box = models.Box(
                name=box_name,
                tab_id=tab.id,
                description=None,
                tag_ids=[],
            )
            db.add(box)
            db.flush()
            created_boxes += 1
            existing_box_names.add(box_name.lower())

            position = 1
            for item_data in box_entry.get("items") or []:
                item_name = parser_storage.extract_item_name(item_data, field_names)
                if not item_name:
                    continue

                item_qty = parser_storage.extract_item_qty(item_data)
                metadata = _build_metadata(item_data, field_lookup)

                item = models.Item(
                    name=item_name,
                    qty=item_qty,
                    tab_id=tab.id,
                    box_id=box.id,
                    box_position=position,
                    metadata_json=metadata,
                    tag_ids=[],
                )
                db.add(item)
                created_items += 1
                position += max(int(item_qty or 0), 1)

        db.commit()
    except Exception:
        db.rollback()
        raise

    return schemas.ParserImportResult(
        tab_id=tab.id,
        fields_created=len(created_fields),
        boxes_created=created_boxes,
        items_created=created_items,
    )
def _build_metadata(item: Dict[str, Any], field_lookup: Dict[str, models.TabField]) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    for field_name, field in field_lookup.items():
        if field_name in parser_storage.NAME_FIELDS or field_name in parser_storage.QTY_FIELDS:
            continue
        raw_value = item.get(field_name)
        if raw_value is None:
            continue
        if isinstance(raw_value, str):
            raw_value = raw_value.strip()
        if raw_value in ("", None):
            continue
        metadata[field.stable_key] = raw_value
    return metadata
