from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app import schemas, database
from app.crud import tags

router = APIRouter(prefix="/tags", tags=["Tags"])

@router.post("/", response_model=schemas.TagRead)
def create_tag(tag: schemas.TagCreate, db: Session = Depends(database.get_db)):
    return tags.create_tag(db, tag)

@router.post("/{tag_id}/attach", response_model=schemas.TagRead)
def attach_tag(tag_id: int, payload: schemas.TagLinkPayload, db: Session = Depends(database.get_db)):
    return tags.attach_tag(db, tag_id, payload)

@router.post("/{tag_id}/detach", response_model=schemas.TagRead)
def detach_tag(tag_id: int, payload: schemas.TagLinkPayload, db: Session = Depends(database.get_db)):
    return tags.detach_tag(db, tag_id, payload)

@router.get("/", response_model=List[schemas.TagRead])
def get_tags(db: Session = Depends(database.get_db)):
    return tags.get_tags(db)

@router.put("/{tag_id}", response_model=schemas.TagRead)
def update_tag(tag_id: int, tag_data: schemas.TagUpdate, db: Session = Depends(database.get_db)):
    return tags.update_tag(db, tag_id, tag_data)

@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(database.get_db)):
    return tags.delete_tag(db, tag_id)
