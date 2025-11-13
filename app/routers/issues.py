from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas, database
from app.crud import issues as issues_crud
from app.security import require_read_access

router = APIRouter(prefix="/issues", tags=["Issues"], dependencies=[Depends(require_read_access)])


@router.get("/", response_model=List[schemas.IssueHistoryEntry])
def list_issues(limit: int = 200, db: Session = Depends(database.get_db)):
    return issues_crud.list_issues(db, limit=limit)
