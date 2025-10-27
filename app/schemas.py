from pydantic import BaseModel
from typing import Optional, Dict

class ItemBase(BaseModel):
    name: str
    qty: int
    attributes: Optional[Dict[str, str]] = None

class ItemCreate(ItemBase):
    tab_id: int
    box_id: Optional[int] = None

class ItemOut(ItemBase):
    id: int
    tab_id: int
    box_id: Optional[int] = None

    class Config:
        orm_mode = True
