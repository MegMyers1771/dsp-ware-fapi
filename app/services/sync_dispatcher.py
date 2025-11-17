from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Optional

from app.services import sync_queue

logger = logging.getLogger(__name__)


def _field_name_map(fields: Iterable) -> Dict[str, str]:
    mapping = {}
    for field in fields or []:
        stable_key = getattr(field, "stable_key", None) or field.name
        mapping[stable_key] = field.name
    return mapping


def build_item_payload(tab, box, item, fields: Iterable) -> Optional[Dict[str, Any]]:
    if not tab or not getattr(tab, "enable_sync", False):
        return None
    config_name = getattr(tab, "sync_config", None)
    if not config_name:
        return None

    field_map = _field_name_map(fields)
    metadata = {}
    for key, value in (getattr(item, "metadata_json", None) or {}).items():
        display_name = field_map.get(key, key)
        metadata[display_name] = value

    box_name = getattr(box, "name", None)
    if not box_name:
        box_id = getattr(box, "id", None) if box else None
        box_name = f"Ящик #{box_id}" if box_id else "Ящик"

    payload = {
        "tab": {
            "id": getattr(tab, "id", None),
            "name": getattr(tab, "name", None),
            "sync_config": config_name,
        },
        "box": {
            "id": getattr(box, "id", None) if box else None,
            "name": box_name,
        },
        "item": {
            "id": getattr(item, "id", None),
            "name": getattr(item, "name", None),
            "qty": getattr(item, "qty", None),
            "metadata": metadata,
        },
    }
    return payload


def enqueue_item_created(payload: Optional[Dict[str, Any]]) -> None:
    if not payload or not payload.get("tab", {}).get("sync_config"):
        return
    try:
        sync_queue.enqueue_sync_job("create", payload)
    except Exception:
        logger.exception("Не удалось отправить задачу синхронизации (create)")


def enqueue_item_updated(before_payload: Optional[Dict[str, Any]], after_payload: Optional[Dict[str, Any]]) -> None:
    if not after_payload or not after_payload.get("tab", {}).get("sync_config"):
        return
    try:
        sync_queue.enqueue_sync_job(
            "update",
            {"before": before_payload, "after": after_payload},
        )
    except Exception:
        logger.exception("Не удалось отправить задачу синхронизации (update)")


def enqueue_item_deleted(payload: Optional[Dict[str, Any]]) -> None:
    if not payload or not payload.get("tab", {}).get("sync_config"):
        return
    try:
        sync_queue.enqueue_sync_job("delete", payload)
    except Exception:
        logger.exception("Не удалось отправить задачу синхронизации (delete)")
