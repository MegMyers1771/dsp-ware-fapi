from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import database, models, schemas
from app.crud import users as users_crud
from app.security import require_admin_access

router = APIRouter(prefix="/users", tags=["Users"], dependencies=[Depends(require_admin_access)])


@router.get("/", response_model=List[schemas.UserRead])
async def list_users(db: Session = Depends(database.get_db)):
    return users_crud.list_users(db)


@router.patch("/{user_id}", response_model=schemas.UserRead)
async def update_user(user_id: int, payload: schemas.UserUpdate, db: Session = Depends(database.get_db)):
    user = users_crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin" and payload.role and payload.role != "admin":
        admins = [u for u in users_crud.list_users(db) if u.role == "admin" and u.id != user.id]
        if not admins:
            raise HTTPException(status_code=400, detail="Нельзя понижать единственного администратора")
    user = users_crud.update_user(db, user, payload)
    return user
