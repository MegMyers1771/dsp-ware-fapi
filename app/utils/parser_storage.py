from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from fastapi import HTTPException

from app import schemas
from app.services import parser_utils

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIGS_DIR = PROJECT_ROOT / "gsheets_parser" / "json_configs"
PARSED_TABS_DIR = PROJECT_ROOT / "gsheets_parser" / "parsed-tabs"

NAME_FIELDS = ("Имя", "Name", "Товар")
QTY_FIELDS = ("Кол-во", "Кол-во.", "Количество", "Qty")
REQUIRED_FIELD_NAMES = ("Имя", "Кол-во")


def list_configs() -> List[Dict[str, Any]]:
    if not CONFIGS_DIR.exists():
        return []
    configs: List[Dict[str, Any]] = []
    for path in sorted(CONFIGS_DIR.glob("*.json")):
        data = _load_json(path)
        summary = _build_summary(path.stem, data)
        configs.append(summary)
    configs.sort(key=lambda item: item.get("worksheet_name", "").lower())
    return configs


def get_config(name: str) -> Dict[str, Any]:
    path = resolve_config_path(name)
    data = _load_json(path)
    summary = _build_summary(path.stem, data)
    return {
        **summary,
        "fields": data.get("fields") or {},
        "reserved_ranges": data.get("reserved_ranges") or {},
    }


def create_config(payload: schemas.ParserConfigCreate) -> Dict[str, Any]:
    if not payload.worksheet_name.strip():
        raise HTTPException(status_code=400, detail="Название вкладки не может быть пустым")
    if not payload.box_column.strip():
        raise HTTPException(status_code=400, detail="Колонка ящиков не может быть пустой")
    fields = clean_mapping(payload.fields)
    if not fields:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы одно поле")

    reserved = clean_mapping(payload.reserved_ranges)
    identifier = parser_utils.sanitize_name(payload.worksheet_name)
    CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
    path = CONFIGS_DIR / f"{identifier}.json"
    if path.exists():
        raise HTTPException(status_code=400, detail=f"Конфиг «{payload.worksheet_name}» уже существует")

    config_data = {
        "worksheet_name": payload.worksheet_name.strip(),
        "box_column": payload.box_column.strip(),
        "fields": fields,
        "reserved_ranges": reserved,
        "enable_pos": payload.enable_pos,
    }
    write_json(path, config_data)
    summary = _build_summary(path.stem, config_data)
    return {
        **summary,
        "fields": fields,
        "reserved_ranges": reserved,
    }


def delete_config(name: str) -> None:
    path = resolve_config_path(name)
    identifier = path.stem
    path.unlink()
    parsed_path = PARSED_TABS_DIR / f"{identifier}.json"
    if parsed_path.exists():
        parsed_path.unlink()


def list_parsed_tabs() -> List[schemas.ParsedTabSummary]:
    if not PARSED_TABS_DIR.exists():
        return []

    summaries: List[schemas.ParsedTabSummary] = []
    for path in sorted(PARSED_TABS_DIR.glob("*.json")):
        data = _load_json(path)
        boxes = data.get("boxes") or []
        items_count = sum(len(box.get("items") or []) for box in boxes)
        allowed_values = normalize_allowed_map(data.get("reserved"))

        summaries.append(
            schemas.ParsedTabSummary(
                name=resolve_tab_name(data, path.stem),
                boxes_count=len(boxes),
                items_count=items_count,
                fields_count=len(data.get("fields") or []),
                has_allowed_values=any(bool(vals) for vals in allowed_values.values()),
            )
        )

    summaries.sort(key=lambda item: item.name.lower())
    return summaries


def get_parsed_tab(tab_name: str) -> schemas.ParsedTabDetail:
    data, _ = load_parsed_file(tab_name)
    allowed_values = normalize_allowed_map(data.get("reserved"))

    boxes = [
        schemas.ParsedTabBoxDetail(
            name=(box.get("box") or f"Box #{idx + 1}"),
            items=list(box.get("items") or []),
        )
        for idx, box in enumerate(data.get("boxes") or [])
    ]

    return schemas.ParsedTabDetail(
        name=resolve_tab_name(data, tab_name),
        enable_pos=bool(data.get("enable_pos", True)),
        fields=list(data.get("fields") or []),
        allowed_values=allowed_values,
        boxes=boxes,
    )


def load_parsed_file(tab_name: str) -> Tuple[Dict[str, Any], Path]:
    if not PARSED_TABS_DIR.exists():
        raise HTTPException(status_code=404, detail="Каталог parsed-tabs не найден")

    safe_name = _sanitize_tab_name(tab_name)
    direct_path = PARSED_TABS_DIR / f"{safe_name}.json"
    if direct_path.exists():
        return _load_json(direct_path), direct_path

    normalized_target = normalize_token(tab_name)
    for path in PARSED_TABS_DIR.glob("*.json"):
        data = _load_json(path)
        candidates = {path.stem, str(data.get("worksheet_name") or "")}
        for candidate in candidates:
            if candidate and normalize_token(candidate) == normalized_target:
                return data, path

    raise HTTPException(status_code=404, detail=f"Файл для вкладки «{tab_name}» не найден")


def clean_mapping(value: Dict[str, Any] | None) -> Dict[str, str]:
    if not value:
        return {}
    result: Dict[str, str] = {}
    for key, item in value.items():
        key_text = str(key).strip()
        if not key_text:
            continue
        val_text = str(item).strip()
        if not val_text:
            continue
        result[key_text] = val_text
    return result


def resolve_config_path(name: str) -> Path:
    CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
    direct = CONFIGS_DIR / f"{name}.json"
    if direct.exists():
        return direct

    target = normalize_token(name)
    for path in CONFIGS_DIR.glob("*.json"):
        data = _load_json(path)
        worksheet = str(data.get("worksheet_name") or "")
        if worksheet and normalize_token(worksheet) == target:
            return path

    raise HTTPException(status_code=404, detail=f"Конфиг «{name}» не найден")


def normalize_token(value: str) -> str:
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


def normalize_allowed_map(raw_allowed: Any) -> Dict[str, List[str]]:
    if not isinstance(raw_allowed, dict):
        return {}
    normalized: Dict[str, List[str]] = {}
    for key, values in raw_allowed.items():
        sanitized = _sanitize_allowed_values(values)
        normalized[str(key)] = sanitized or []
    return normalized


def match_allowed_values(field_name: str, allowed_map: Dict[str, List[str]]) -> List[str] | None:
    if not allowed_map:
        return None

    direct = allowed_map.get(field_name)
    if direct:
        return direct

    target = normalize_token(field_name)
    if not target:
        return None

    for key, values in allowed_map.items():
        key_norm = normalize_token(key)
        if not key_norm:
            continue
        if key_norm == target or key_norm.startswith(target) or target.startswith(key_norm):
            if values:
                return values
    return None


def ensure_required_fields(field_names: List[str]) -> None:
    normalized = {normalize_token(name) for name in field_names}
    missing = [
        required
        for required in REQUIRED_FIELD_NAMES
        if normalize_token(required) not in normalized
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Отсутствуют обязательные поля: {', '.join(missing)}",
        )


def is_core_name_field(field_name: str) -> bool:
    target = normalize_token(field_name)
    return target in {normalize_token(name) for name in NAME_FIELDS}


def is_core_qty_field(field_name: str) -> bool:
    target = normalize_token(field_name)
    return target in {normalize_token(name) for name in QTY_FIELDS}


def extract_item_name(item: Dict[str, Any], field_order: List[str]) -> str | None:
    for key in NAME_FIELDS:
        return item.get(key) or ""
        # Historical behaviour: return the first matching field immediately.
        # If the upstream data ever omits NAME_FIELDS entirely, fall back to field order below.
    for key in field_order:
        value = item.get(key)
        if value and str(value).strip():
            return str(value).strip()
    return None


def extract_item_qty(item: Dict[str, Any]) -> int:
    for key in QTY_FIELDS:
        if key in item:
            qty = _parse_int(item.get(key))
            if qty:
                return qty
    return 1


def _build_summary(identifier: str, data: Dict[str, Any]) -> Dict[str, Any]:
    fields = data.get("fields") or {}
    reserved = data.get("reserved_ranges") or {}
    parsed = load_parsed_data(identifier)
    parsed_stats = parsed or {}
    boxes = parsed_stats.get("boxes") or []
    parsed_reserved = parsed_stats.get("reserved") or {}
    allowed_values_present = any(bool(vals) for vals in parsed_reserved.values())

    return {
        "name": identifier,
        "worksheet_name": str(data.get("worksheet_name") or "").strip(),
        "box_column": str(data.get("box_column") or "").strip(),
        "fields_count": len(fields),
        "reserved_ranges_count": len(reserved),
        "enable_pos": bool(data.get("enable_pos", True)),
        "parsed": bool(parsed),
        "parsed_boxes_count": len(boxes) if parsed else None,
        "parsed_items_count": sum(len(box.get("items") or []) for box in boxes) if parsed else None,
        "parsed_has_allowed_values": allowed_values_present,
        "parsed_file_name": f"{identifier}.json",
    }


def load_parsed_data(identifier: str) -> Dict[str, Any] | None:
    parsed_path = PARSED_TABS_DIR / f"{identifier}.json"
    if not parsed_path.exists():
        return {}
    return _load_json(parsed_path)


def resolve_tab_name(data: Dict[str, Any], fallback: str) -> str:
    worksheet = str(data.get("worksheet_name") or "").strip()
    if worksheet:
        return worksheet
    return str(fallback).strip()


def _sanitize_tab_name(value: str) -> str:
    sanitized = Path(value).name
    if sanitized.lower().endswith(".json"):
        sanitized = sanitized[: -len(".json")]
    return sanitized


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


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


def _parse_int(value: Any) -> int:
    if isinstance(value, (int, float)):
        return max(int(value), 1)
    if isinstance(value, str):
        digits = re.findall(r"\d+", value.replace(",", "."))
        if digits:
            return max(int(digits[0]), 1)
    return 1
