from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Optional

from redis import Redis
from rq import Queue, Retry, Worker

logger = logging.getLogger(__name__)

_ERROR_KEY = "sync_worker:last_error"


@lru_cache
def _redis_connection() -> Redis:
    redis_url = os.getenv("RQ_REDIS_URL", "redis://localhost:6379/0")
    return Redis.from_url(redis_url)


@lru_cache
def _queue() -> Queue:
    queue_name = os.getenv("RQ_QUEUE_NAME", "sync")
    default_timeout = int(os.getenv("RQ_DEFAULT_TIMEOUT", "90"))
    return Queue(queue_name, connection=_redis_connection(), default_timeout=default_timeout)


def enqueue_sync_job(action: str, payload: dict | None) -> None:
    if not payload:
        return

    queue = _queue()
    retry = Retry(max=3, interval=[5, 15, 30])
    queue.enqueue(
        "app.services.sync_worker.handle_sync_event",
        action,
        payload,
        retry=retry,
    )


def has_active_worker() -> bool:
    """
    Проверяет доступность хотя бы одного воркера, обслуживающего очередь синхронизации.
    """
    try:
        queue = _queue()
        connection = queue.connection
        queue_name = queue.name
        workers = Worker.all(connection=connection)
        for worker in workers or []:
            try:
                if queue_name in set(worker.queue_names()):
                    return True
            except Exception:
                continue
        return False
    except Exception:
        logger.exception("Не удалось проверить статус воркера синхронизации")
        return False


def set_last_error(message: str, ttl_seconds: int = 3600) -> None:
    """
    Сохраняет последнее сообщение об ошибке воркера в Redis, чтобы фронт мог показать алерт.
    """
    try:
        _redis_connection().set(_ERROR_KEY, message, ex=ttl_seconds)
    except Exception:
        logger.exception("Не удалось записать ошибку воркера")


def clear_last_error() -> None:
    try:
        _redis_connection().delete(_ERROR_KEY)
    except Exception:
        logger.exception("Не удалось очистить ошибку воркера")


def get_last_error() -> Optional[str]:
    try:
        raw = _redis_connection().get(_ERROR_KEY)
        if raw is None:
            return None
        return raw.decode("utf-8", "ignore") if isinstance(raw, (bytes, bytearray)) else str(raw)
    except Exception:
        logger.exception("Не удалось получить сообщение об ошибке воркера")
        return None


def get_worker_status() -> dict:
    """
    Возвращает статус воркера с последней ошибкой (если была).
    """
    return {
        "rq_worker_online": has_active_worker(),
        "last_error": get_last_error(),
    }
