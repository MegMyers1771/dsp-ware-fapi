from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.services.google_sync import SyncConfigurationError, TabSyncManager

logger = logging.getLogger(__name__)


def _resolve_config(payload: Dict[str, Any] | None) -> Optional[str]:
    if not payload:
        return None
    tab_info = payload.get("tab") or {}
    config = tab_info.get("sync_config")
    if not config:
        logger.debug("Sync skipped: таб не привязан к конфигу")
    return config


def handle_sync_event(action: str, payload: Dict[str, Any]) -> None:
    if action not in {"create", "update", "delete"}:
        logger.warning("Неизвестный тип задачи синхронизации: %s", action)
        return

    config_name = None
    if action == "update":
        config_name = _resolve_config(payload.get("after") or payload.get("before"))
    else:
        config_name = _resolve_config(payload)

    if not config_name:
        return

    try:
        manager = TabSyncManager(config_name)
        if action == "create":
            manager.handle_create(payload)
        elif action == "update":
            manager.handle_update(payload.get("before") or {}, payload.get("after") or {})
        else:
            manager.handle_delete(payload)
    except SyncConfigurationError as exc:
        logger.warning("Синхронизация отключена: %s", exc)
    except Exception:
        logger.exception("Ошибка обработки задачи синхронизации")
        raise
