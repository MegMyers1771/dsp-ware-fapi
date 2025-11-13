from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import database, models, schemas
from app.crud import users as users_crud
from app.security import (
    create_access_token,
    get_current_user_optional,
    require_read_access,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=schemas.UserRead)
async def register_user(
    payload: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User | None = Depends(get_current_user_optional),
):
    user_count = users_crud.get_user_count(db)
    if user_count > 0:
        if not current_user or current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Только администратор может создавать пользователей")

    try:
        user = users_crud.create_user(db, payload)
    except ValueError:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    return user


@router.post("/login", response_model=schemas.TokenWithUser)
async def login(payload: schemas.LoginRequest, db: Session = Depends(database.get_db)):
    user = users_crud.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=400, detail="Неверный email или пароль")

    token = create_access_token({"sub": str(user.id)})
    return schemas.TokenWithUser(access_token=token, token_type="bearer", user=user)


@router.get("/me", response_model=schemas.UserRead)
async def read_me(current_user: models.User = Depends(require_read_access)):
    return current_user
