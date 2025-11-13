from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import database, schemas
from app.crud import parser_import
from app.security import require_edit_access
from app.services import parser_runner

router = APIRouter(
    prefix="/parser",
    tags=["Parser"],
    dependencies=[Depends(require_edit_access)],
)


@router.get("/tabs", response_model=List[schemas.ParsedTabSummary])
def list_parsed_tabs():
    return parser_import.list_parsed_tabs()


@router.get("/tabs/{tab_name}", response_model=schemas.ParsedTabDetail)
def get_parsed_tab(tab_name: str):
    return parser_import.get_parsed_tab(tab_name)


@router.post("/tabs/{tab_name}/import", response_model=schemas.ParserImportResult)
def import_parsed_tab(tab_name: str, db: Session = Depends(database.get_db)):
    return parser_import.import_parsed_tab(db, tab_name)


@router.post("/run", response_model=schemas.ParserRunResponse)
def run_parser(config: schemas.ParserRunPayload):
    return parser_runner.run_parser(config)
