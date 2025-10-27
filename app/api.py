from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db import get_session
from app import models, schemas

router = APIRouter()

@router.post("/items", response_model=schemas.ItemOut)
async def create_item(item: schemas.ItemCreate, session: AsyncSession = Depends(get_session)):
    new_item = models.Item(**item.model_dump())
    session.add(new_item)
    await session.commit()
    await session.refresh(new_item)
    return new_item


@router.get("/items", response_model=list[schemas.ItemOut])
async def list_items(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(models.Item))
    return result.scalars().all()
