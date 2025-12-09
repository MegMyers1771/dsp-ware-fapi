from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from fastapi import HTTPException

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = PROJECT_ROOT / "sheets_config.json"


def _read_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {"SPREADSHEET_ID": "", "CREDENTIALS": "credentials.json"}
    try:
        with CONFIG_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"Не удалось прочитать sheets_config.json: {exc}") from exc
    return {
        "SPREADSHEET_ID": data.get("SPREADSHEET_ID", ""),
        "CREDENTIALS": data.get("CREDENTIALS", "credentials.json"),
    }


def _write_config(data: Dict[str, Any]) -> Dict[str, str]:
    try:
        with CONFIG_PATH.open("w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Не удалось сохранить sheets_config.json: {exc}") from exc
    return {
        "spreadsheet_id": data.get("SPREADSHEET_ID", ""),
        "credentials_path": data.get("CREDENTIALS", ""),
    }


def get_settings() -> Dict[str, str]:
    data = _read_config()
    return {
        "spreadsheet_id": data.get("SPREADSHEET_ID", ""),
        "credentials_path": data.get("CREDENTIALS", ""),
    }


def update_settings(values: Dict[str, str]) -> Dict[str, str]:
    current = _read_config()
    updated = {
        "SPREADSHEET_ID": values.get("SPREADSHEET_ID", current.get("SPREADSHEET_ID", "")),
        "CREDENTIALS": values.get("CREDENTIALS", current.get("CREDENTIALS", "")),
    }
    return _write_config(updated)


def _resolve_path(path_value: str) -> Path:
    path = Path(path_value)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


def save_credentials_file(data: Dict[str, Any], destination: str | None = None) -> Dict[str, str]:
    # Всегда сохраняем под предсказуемым именем, чтобы не требовать от пользователя ввод пути.
    path_value = destination or "credentials.json"
    target_path = _resolve_path(path_value)
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with target_path.open("w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Не удалось сохранить credentials: {exc}") from exc

    return update_settings({"CREDENTIALS": path_value})


def get_credentials_file() -> str:
    data = _read_config()
    path_value = data.get("CREDENTIALS") or "credentials.json"
    return str(_resolve_path(path_value))
