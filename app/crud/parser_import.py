from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PARSED_TABS_DIR = PROJECT_ROOT / "gsheets_parser" / "parsed-tabs"

NAME_FIELDS = ("Имя", "Name", "Товар")
QTY_FIELDS = ("Кол-во", "Кол-во.", "Количество", "Qty")
REQUIRED_FIELD_NAMES = ("Имя", "Кол-во")


def list_parsed_tabs() -> List[schemas.ParsedTabSummary]:
    if not PARSED_TABS_DIR.exists():
        return []

    summaries: List[schemas.ParsedTabSummary] = []
    for path in sorted(PARSED_TABS_DIR.glob("*.json")):
        data = _load_json(path)
        boxes = data.get("boxes") or []
        items_count = sum(len(box.get("items") or []) for box in boxes)
        allowed_values = _normalize_allowed_map(data.get("reserved"))

        summaries.append(
            schemas.ParsedTabSummary(
                name=_resolve_tab_name(data, path.stem),
                boxes_count=len(boxes),
                items_count=items_count,
                fields_count=len(data.get("fields") or []),
                has_allowed_values=any(bool(vals) for vals in allowed_values.values()),
            )
        )

    summaries.sort(key=lambda item: item.name.lower())
    return summaries


def get_parsed_tab(tab_name: str) -> schemas.ParsedTabDetail:
    data, _ = _load_parsed_file(tab_name)
    allowed_values = _normalize_allowed_map(data.get("reserved"))

    boxes = [
        schemas.ParsedTabBoxDetail(
            name=(box.get("box") or f"Box #{idx + 1}"),
            items=list(box.get("items") or []),
        )
        for idx, box in enumerate(data.get("boxes") or [])
    ]

    return schemas.ParsedTabDetail(
        name=_resolve_tab_name(data, tab_name),
        enable_pos=bool(data.get("enable_pos", True)),
        fields=list(data.get("fields") or []),
        allowed_values=allowed_values,
        boxes=boxes,
    )


def import_parsed_tab(db: Session, tab_name: str) -> schemas.ParserImportResult:
    data, source_path = _load_parsed_file(tab_name)
    tab_display_name = _resolve_tab_name(data, source_path.stem)
    if not tab_display_name:
        raise HTTPException(status_code=400, detail="Не удалось определить название вкладки")

    existing = (
        db.query(models.Tab)
        .filter(func.lower(models.Tab.name) == func.lower(tab_display_name))
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Вкладка «{tab_display_name}» уже существует")

    allowed_values = _normalize_allowed_map(data.get("reserved"))
    field_names = [str(name).strip() for name in data.get("fields") or [] if str(name).strip()]
    boxes_data = data.get("boxes") or []
    enable_pos = bool(data.get("enable_pos", True))

    _ensure_required_fields(field_names)

    if not field_names:
        raise HTTPException(status_code=400, detail="В файле отсутствует список полей вкладки")

    try:
        tab = models.Tab(name=tab_display_name, description=None, enable_pos=enable_pos, tag_ids=[])
        db.add(tab)
        db.flush()

        created_fields: List[models.TabField] = []
        for field_name in field_names:
            if _is_core_name_field(field_name) or _is_core_qty_field(field_name):
                continue
            allowed = _match_allowed_values(field_name, allowed_values)
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
                item_name = _extract_item_name(item_data, field_names)
                if not item_name:
                    continue

                item_qty = _extract_item_qty(item_data)
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
                position += 1

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


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _resolve_tab_name(data: Dict[str, Any], fallback: str) -> str:
    worksheet = str(data.get("worksheet_name") or "").strip()
    if worksheet:
        return worksheet
    return str(fallback).strip()


def _sanitize_tab_name(value: str) -> str:
    sanitized = Path(value).name
    if sanitized.lower().endswith(".json"):
        sanitized = sanitized[: -len(".json")]
    return sanitized


def _load_parsed_file(tab_name: str) -> Tuple[Dict[str, Any], Path]:
    if not PARSED_TABS_DIR.exists():
        raise HTTPException(status_code=404, detail="Каталог parsed-tabs не найден")

    safe_name = _sanitize_tab_name(tab_name)
    direct_path = PARSED_TABS_DIR / f"{safe_name}.json"
    if direct_path.exists():
        return _load_json(direct_path), direct_path

    normalized_target = _normalize_token(tab_name)
    for path in PARSED_TABS_DIR.glob("*.json"):
        data = _load_json(path)
        candidates = {path.stem, str(data.get("worksheet_name") or "")}
        for candidate in candidates:
            if candidate and _normalize_token(candidate) == normalized_target:
                return data, path

    raise HTTPException(status_code=404, detail=f"Файл для вкладки «{tab_name}» не найден")


def _normalize_token(value: str) -> str:
    value = (value or "").lower()
    replacements = (
        ("ё", "е"),
        ("Ё", "е"),
        ("э", "е"),
        ("Э", "е"),
    )
    for src, target in replacements:
        value = value.replace(src, target)
    return re.sub(r"[^0-9a-zа-я]+", "", value)


def _normalize_allowed_map(raw_allowed: Any) -> Dict[str, List[str]]:
    if not isinstance(raw_allowed, dict):
        return {}
    normalized: Dict[str, List[str]] = {}
    for key, values in raw_allowed.items():
        sanitized = _sanitize_allowed_values(values)
        normalized[str(key)] = sanitized or []
    return normalized


def _sanitize_allowed_values(values: Any) -> List[str]:
    if values is None:
        return []
    if isinstance(values, str):
        values = [values]
    if not isinstance(values, Iterable):
        return []
    result: List[str] = []
    seen = set()
    for raw in values:
        if raw is None:
            continue
        text = str(raw).strip()
        if not text or text.lower() in seen:
            continue
        seen.add(text.lower())
        result.append(text)
    return result


def _match_allowed_values(field_name: str, allowed_map: Dict[str, List[str]]) -> List[str] | None:
    if not allowed_map:
        return None

    direct = allowed_map.get(field_name)
    if direct:
        return direct

    target = _normalize_token(field_name)
    if not target:
        return None

    for key, values in allowed_map.items():
        key_norm = _normalize_token(key)
        if not key_norm:
            continue
        if key_norm == target or key_norm.startswith(target) or target.startswith(key_norm):
            if values:
                return values
    return None


def _ensure_required_fields(field_names: List[str]) -> None:
    normalized = {_normalize_token(name) for name in field_names}
    missing = [
        required
        for required in REQUIRED_FIELD_NAMES
        if _normalize_token(required) not in normalized
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Отсутствуют обязательные поля: {', '.join(missing)}",
        )


def _is_core_name_field(field_name: str) -> bool:
    target = _normalize_token(field_name)
    return target in {_normalize_token(name) for name in NAME_FIELDS}


def _is_core_qty_field(field_name: str) -> bool:
    target = _normalize_token(field_name)
    return target in {_normalize_token(name) for name in QTY_FIELDS}


def _extract_item_name(item: Dict[str, Any], field_order: List[str]) -> str | None:
    for key in NAME_FIELDS:
        return item.get(key) or ""
        # if value and str(value).strip():
        #     return str(value).strip()

    for key in field_order:
        value = item.get(key)
        if value and str(value).strip():
            return str(value).strip()
    return None


def _extract_item_qty(item: Dict[str, Any]) -> int:
    for key in QTY_FIELDS:
        if key in item:
            qty = _parse_int(item.get(key))
            if qty:
                return qty
    return 1


def _parse_int(value: Any) -> int:
    if isinstance(value, (int, float)):
        return max(int(value), 1)
    if isinstance(value, str):
        digits = re.findall(r"\d+", value.replace(",", "."))
        if digits:
            return max(int(digits[0]), 1)
    return 1


def _build_metadata(item: Dict[str, Any], field_lookup: Dict[str, models.TabField]) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    for field_name, field in field_lookup.items():
        if field_name in NAME_FIELDS or field_name in QTY_FIELDS:
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
