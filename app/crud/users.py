from typing import List, Optional

from sqlalchemy.orm import Session

from app import models, schemas
from app.security import get_password_hash, verify_password


def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_name(db: Session, user_name: str) -> Optional[models.User]:
    return (
        db.query(models.User)
        .filter(models.User.user_name == user_name.lower())
        .first()
    )


def get_user_count(db: Session) -> int:
    return db.query(models.User).count()


def create_user(db: Session, payload: schemas.UserCreate) -> models.User:
    normalized_name = payload.user_name.lower()
    if get_user_by_name(db, normalized_name):
        raise ValueError("Имя пользователя уже используется")

    db_user = models.User(
        user_name=normalized_name,
        hashed_password=get_password_hash(payload.password),
        role=payload.role or "viewer",
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def list_users(db: Session) -> List[models.User]:
    return db.query(models.User).order_by(models.User.id.asc()).all()


def update_user(db: Session, user: models.User, payload: schemas.UserUpdate) -> models.User:
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: models.User) -> None:
    db.delete(user)
    db.commit()


def authenticate_user(db: Session, user_name: str, password: str) -> Optional[models.User]:
    user = get_user_by_name(db, user_name.lower())
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user
