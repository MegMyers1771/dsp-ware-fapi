from __future__ import annotations

import json
from importlib import import_module
from pathlib import Path
from typing import Any, Dict

from fastapi import HTTPException

from app import schemas
from app.services import parser_utils, sheets_config

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PARSER_ROOT = PROJECT_ROOT / "gsheets_parser"
PARSED_TABS_DIR = PARSER_ROOT / "parsed-tabs"
DEFAULT_CREDENTIALS = PROJECT_ROOT / "credentials.json"

_PARSER_MODULE = None


def run_parser(payload: schemas.ParserRunPayload) -> schemas.ParserRunResponse:
    module = _load_parser_module()
    config = _build_config(payload)

    try:
        result: Dict[str, Any] = module.main(config)
    except Exception as exc:  # propagate known HTTPException later
        raise exc

    worksheet_name = str(result.get("worksheet_name") or payload.worksheet_name).strip() or "parsed_tab"
    file_name = parser_utils.build_json_filename(worksheet_name)
    PARSED_TABS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = PARSED_TABS_DIR / file_name
    result.setdefault("enable_pos", payload.enable_pos)

    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)

    boxes = result.get("boxes") or []
    items_count = sum(len(box.get("items") or []) for box in boxes)

    return schemas.ParserRunResponse(
        worksheet_name=worksheet_name,
        file_name=file_name,
        boxes_count=len(boxes),
        items_count=items_count,
        enable_pos=bool(result.get("enable_pos", True)),
    )


def run_parser_from_config(config: Dict[str, Any]) -> schemas.ParserRunResponse:
    settings = sheets_config.get_settings()
    spreadsheet_id = settings.get("spreadsheet_id")
    if not spreadsheet_id:
        raise HTTPException(status_code=400, detail="SPREADSHEET_ID не указан в sheets_config.json")

    worksheet_name = str(config.get("worksheet_name") or "").strip()
    box_column = str(config.get("box_column") or "").strip()
    fields = config.get("fields") or {}
    reserved = config.get("reserved_ranges") or {}
    enable_pos = bool(config.get("enable_pos", True))

    if not worksheet_name or not box_column or not fields:
        raise HTTPException(status_code=400, detail="Конфиг неполный или повреждён")

    payload = schemas.ParserRunPayload(
        spreadsheet_id=spreadsheet_id,
        worksheet_name=worksheet_name,
        box_column=box_column,
        fields={str(k).strip(): str(v).strip() for k, v in fields.items() if str(k).strip() and str(v).strip()},
        reserved_ranges={str(k).strip(): str(v).strip() for k, v in reserved.items() if str(k).strip() and str(v).strip()},
        enable_pos=enable_pos,
    )
    return run_parser(payload)


def _build_config(payload: schemas.ParserRunPayload) -> Dict[str, Any]:
    if not _get_credentials_path().exists():
        raise HTTPException(status_code=400, detail="Credentials файл не найден")

    config = {
        "spreadsheet_id": payload.spreadsheet_id.strip(),
        "worksheet_name": payload.worksheet_name.strip(),
        "box_column": payload.box_column.strip(),
        "fields": payload.fields,
        "reserved_ranges": payload.reserved_ranges,
        "creds": str(_get_credentials_path()),
        "enable_pos": payload.enable_pos,
    }

    required_string_keys = ("spreadsheet_id", "worksheet_name", "box_column")
    missing = [
        key
        for key in required_string_keys
        if not config.get(key)
    ]
    if missing:
        raise HTTPException(status_code=400, detail=f"Отсутствуют обязательные параметры: {', '.join(missing)}")

    return config


def _load_parser_module():
    global _PARSER_MODULE
    if _PARSER_MODULE is not None:
        return _PARSER_MODULE

    try:
        module = import_module("gsheets_parser.parser")
    except ModuleNotFoundError as exc:
        raise HTTPException(status_code=500, detail="Модуль gsheets_parser.parser не найден") from exc
    _PARSER_MODULE = module
    return _PARSER_MODULE


def _get_credentials_path() -> Path:
    settings = sheets_config.get_settings()
    path_value = settings.get("credentials_path") or None
    if path_value:
        candidate = Path(path_value)
        if not candidate.is_absolute():
            candidate = PROJECT_ROOT / path_value
        if candidate.exists():
            return candidate
        raise HTTPException(status_code=400, detail=f"Credentials file '{path_value}' не найден")

    if DEFAULT_CREDENTIALS.exists():
        return DEFAULT_CREDENTIALS
    fallback = PROJECT_ROOT / "service_account.json"
    if fallback.exists():
        return fallback
    return DEFAULT_CREDENTIALS
