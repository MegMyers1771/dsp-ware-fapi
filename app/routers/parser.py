from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app import database, schemas
from app.crud import parser_configs, parser_import
from app.security import require_edit_access
from app.services import parser_runner, sheets_config

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


@router.get("/configs", response_model=List[schemas.ParserConfigSummary])
def list_parser_configs():
    return parser_configs.list_configs()


@router.get("/configs/{config_name}", response_model=schemas.ParserConfigDetail)
def get_parser_config(config_name: str):
    return parser_configs.get_config(config_name)


@router.post("/configs", response_model=schemas.ParserConfigDetail, status_code=status.HTTP_201_CREATED)
def create_parser_config(config: schemas.ParserConfigCreate):
    return parser_configs.create_config(config)


@router.post("/configs/{config_name}/run", response_model=schemas.ParserRunResponse)
def run_parser_config(config_name: str):
    config = parser_configs.get_config(config_name)
    return parser_runner.run_parser_from_config(config)


@router.delete("/configs/{config_name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_parser_config(config_name: str):
    parser_configs.delete_config(config_name)


@router.get("/env", response_model=schemas.ParserEnvInfo)
def read_parser_env():
    info = sheets_config.get_settings()
    return schemas.ParserEnvInfo(**info)


@router.put("/env", response_model=schemas.ParserEnvInfo)
def update_parser_env(payload: schemas.ParserEnvUpdate):
    updates = {}
    if payload.spreadsheet_id is not None:
        updates["SPREADSHEET_ID"] = payload.spreadsheet_id
    if payload.credentials_path is not None:
        updates["CREDENTIALS"] = payload.credentials_path
    info = sheets_config.update_settings(updates)
    return schemas.ParserEnvInfo(**info)


@router.post("/credentials/upload", response_model=schemas.ParserEnvInfo)
def upload_parser_credentials(payload: schemas.ParserCredentialsUpload):
    info = sheets_config.save_credentials_file(payload.data, payload.path)
    return schemas.ParserEnvInfo(**info)
