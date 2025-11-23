from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import schemas, database
from app.crud import issues as issues_crud
from app.security import require_read_access, require_edit_access
from app.utils.local_history import HISTORY_XLSX_PATH

router = APIRouter(prefix="/issues", tags=["Issues"], dependencies=[Depends(require_read_access)])


@router.get("/", response_model=schemas.IssueHistoryResponse)
def list_issues(
    page: int = 1,
    per_page: int = 20,
    status_id: Optional[int] = None,
    responsible: Optional[str] = None,
    serial: Optional[str] = None,
    invoice: Optional[str] = None,
    item: Optional[str] = None,
    tab: Optional[str] = None,
    box: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
    db: Session = Depends(database.get_db),
    ):
    return issues_crud.list_issues(
        db,
        page=page,
        per_page=per_page,
        status_id=status_id,
        responsible=responsible,
        serial=serial,
        invoice=invoice,
        item=item,
        tab=tab,
        box=box,
        created_from=created_from,
        created_to=created_to,
    )


@router.get("/export")
def export_issue_history():
    if not HISTORY_XLSX_PATH.exists():
        raise HTTPException(status_code=404, detail="Файл истории ещё не создан")
    filename = HISTORY_XLSX_PATH.name
    return FileResponse(HISTORY_XLSX_PATH, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=filename)


@router.api_route("/{issue_id}/status", methods=["PATCH", "PUT"], response_model=schemas.IssueHistoryEntry, dependencies=[Depends(require_edit_access)])
def update_issue_status(issue_id: int, payload: schemas.IssueStatusUpdate, db: Session = Depends(database.get_db)):
    return issues_crud.update_issue_status(db, issue_id, payload.status_id)
