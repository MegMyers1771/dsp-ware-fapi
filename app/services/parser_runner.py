from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path
from typing import Any, Dict

from fastapi import HTTPException

from app import schemas

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PARSER_ROOT = PROJECT_ROOT / "google-sheets-parser"
PARSER_FILE = PARSER_ROOT / "parser.py"
PARSED_TABS_DIR = PARSER_ROOT / "parsed-tabs"
DEFAULT_CREDENTIALS = PROJECT_ROOT / "test-credentials.json"

_PARSER_MODULE = None


def run_parser(payload: schemas.ParserRunPayload) -> schemas.ParserRunResponse:
    module = _load_parser_module()
    config = _build_config(payload)

    try:
        result: Dict[str, Any] = module.main(config)
    except Exception as exc:  # propagate known HTTPException later
        raise exc

    worksheet_name = str(result.get("worksheet_name") or payload.worksheet_name).strip() or "parsed_tab"
    file_name = _build_file_name(worksheet_name)
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


def _build_config(payload: schemas.ParserRunPayload) -> Dict[str, Any]:
    if not _get_credentials_path().exists():
        raise HTTPException(status_code=400, detail="Credentials file test-credentials.json не найден")

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

    if not PARSER_FILE.exists():
        raise HTTPException(status_code=500, detail="parser.py не найден в google-sheets-parser")

    spec = importlib.util.spec_from_file_location("google_sheets_parser_module", PARSER_FILE)
    if spec is None or spec.loader is None:
        raise HTTPException(status_code=500, detail="Не удалось загрузить parser.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _PARSER_MODULE = module
    return module


def _get_credentials_path() -> Path:
    if DEFAULT_CREDENTIALS.exists():
        return DEFAULT_CREDENTIALS
    fallback = PROJECT_ROOT / "service_account.json"
    if fallback.exists():
        return fallback
    return DEFAULT_CREDENTIALS


def _build_file_name(worksheet_name: str) -> str:
    sanitized = re.sub(r"[^\w\s.-]", "", worksheet_name, flags=re.UNICODE).strip() or "parsed_tab"
    sanitized = re.sub(r"\s+", "_", sanitized)
    return f"{sanitized}.json"
