from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException

from app import schemas
from app.services import parser_utils
from app.crud import parser_import

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIGS_DIR = PROJECT_ROOT / "gsheets_parser" / "json_configs"
PARSED_TABS_DIR = PROJECT_ROOT / "gsheets_parser" / "parsed-tabs"


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
    path = _resolve_config_path(name)
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
    fields = _clean_mapping(payload.fields)
    if not fields:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы одно поле")

    reserved = _clean_mapping(payload.reserved_ranges)
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
    _write_json(path, config_data)
    summary = _build_summary(path.stem, config_data)
    return {
        **summary,
        "fields": fields,
        "reserved_ranges": reserved,
    }


def delete_config(name: str) -> None:
    path = _resolve_config_path(name)
    identifier = path.stem
    path.unlink()
    parsed_path = PARSED_TABS_DIR / f"{identifier}.json"
    if parsed_path.exists():
        parsed_path.unlink()


def _build_summary(identifier: str, data: Dict[str, Any]) -> Dict[str, Any]:
    fields = data.get("fields") or {}
    reserved = data.get("reserved_ranges") or {}
    parsed = _load_parsed_data(identifier)
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


def _resolve_config_path(name: str) -> Path:
    CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
    direct = CONFIGS_DIR / f"{name}.json"
    if direct.exists():
        return direct

    target = parser_import._normalize_token(name)
    for path in CONFIGS_DIR.glob("*.json"):
        data = _load_json(path)
        worksheet = str(data.get("worksheet_name") or "")
        if worksheet and parser_import._normalize_token(worksheet) == target:
            return path

    raise HTTPException(status_code=404, detail=f"Конфиг «{name}» не найден")


def _load_parsed_data(identifier: str) -> Dict[str, Any] | None:
    parsed_path = PARSED_TABS_DIR / f"{identifier}.json"
    if not parsed_path.exists():
        return {}
    return _load_json(parsed_path)


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


def _clean_mapping(value: Dict[str, Any] | None) -> Dict[str, str]:
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
