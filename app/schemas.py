from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# --- Tags ---
class TagBase(BaseModel):
    name: str
    color: Optional[str] = "#cccccc"

class TagCreate(TagBase):
    pass

class TagRead(TagBase):
    id: int

    class Config:
        orm_mode = True


# --- Tabs ---
class TabBase(BaseModel):
    name: str
    description: Optional[str] = None
    tag_id: Optional[int] = None  # можно указать тег для вкладки

class TabCreate(TabBase):
    pass

class TabRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    tag_id: Optional[int] = None
    box_count: Optional[int] = 0
    fields: List["TabFieldRead"] = []

    class Config:
        orm_mode = True


# --- Tab fields ---
class TabFieldBase(BaseModel):
    name: str
    field_type: Optional[str] = "string"
    required: Optional[bool] = False
    default_value: Optional[str] = None

class TabFieldCreate(TabFieldBase):
    tab_id: int

class TabFieldRead(BaseModel):
    id: int
    name: str
    field_type: str
    required: bool
    default_value: Optional[Any]

    class Config:
        orm_mode = True


# --- Boxes ---
class BoxBase(BaseModel):
    name: str
    capacity: int = 10
    slot_count: int = 0
    color: Optional[str] = None
    zone: Optional[str] = None
    description: Optional[str] = None
    tag_id: Optional[int] = None  # теперь можно указать тег

class BoxCreate(BoxBase):
    tab_id: int

class BoxRead(BoxBase):
    id: int
    tab_id: int
    # tag_id: Optional[int]

    class Config:
        orm_mode = True


# --- Slots ---
class SlotBase(BaseModel):
    position: int
    max_qty: int = 10
    tag_id: Optional[int] = None  # теперь тоже может быть тег

class SlotCreate(SlotBase):
    box_id: int

class SlotRead(SlotBase):
    id: int
    box_id: int
    # tag_id: Optional[int]

    class Config:
        orm_mode = True


# --- Items ---
class ItemBase(BaseModel):
    name: str
    qty: int = 1
    position: Optional[int] = None
    metadata_json: Optional[Dict[str, Any]] = {}
    tag_id: Optional[int] = None  # можно задать тег или оставить null

class ItemCreate(ItemBase):
    tab_id: int
    box_id: Optional[int]
    slot_id: Optional[int]

class ItemRead(ItemBase):
    id: int
    tab_id: int
    box_id: Optional[int]
    slot_id: Optional[int]
    # tag_id: Optional[int]

    class Config:
        orm_mode = True
