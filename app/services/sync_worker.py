from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from google.auth.exceptions import RefreshError

from app.services.google_sync import SyncConfigurationError, TabSyncManager
from app.services import sync_queue

logger = logging.getLogger(__name__)
# RQ-воркер запускается без настроек логирования, поэтому INFO не видно.
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
logger.setLevel(logging.INFO)


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

    config_name: Optional[str]
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
        sync_queue.clear_last_error()
    except SyncConfigurationError as exc:
        logger.warning("Синхронизация отключена: %s", exc)
    except RefreshError as exc:
        message = _format_refresh_error(exc)
        logger.warning("Ошибка авторизации Google: %s", message)
        sync_queue.set_last_error(message)
        raise
    except Exception:
        logger.exception("Ошибка обработки задачи синхронизации")
        raise


def _format_refresh_error(exc: RefreshError) -> str:
    """
    Возвращает человекочитаемое сообщение об ошибке обновления токена/валидности JWT.
    """
    # Обычно ошибка приходит как ('invalid_grant: Invalid JWT Signature.', {...})
    message = ""
    for arg in exc.args:
        if isinstance(arg, str):
            message = arg
            break
        if isinstance(arg, dict):
            descr = arg.get("error_description") or arg.get("error")
            if descr:
                message = descr
                break
    if not message:
        message = str(exc)
    return f"Ошибка авторизации Google (JWT): {message}. Проверьте service account credentials."
