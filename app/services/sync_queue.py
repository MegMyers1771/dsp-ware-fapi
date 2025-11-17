from __future__ import annotations

import os
from functools import lru_cache

from redis import Redis
from rq import Queue, Retry


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
