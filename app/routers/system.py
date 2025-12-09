from fastapi import APIRouter, Depends

from app.security import require_read_access
from app.services import sync_queue

router = APIRouter(prefix="/system", tags=["System"], dependencies=[Depends(require_read_access)])


@router.get("/sync-worker")
def read_sync_worker_status():
    """
    Возвращает информацию о доступности воркера очереди синхронизации.
    """
    return sync_queue.get_worker_status()
