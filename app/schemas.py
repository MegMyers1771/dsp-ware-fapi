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
        
class TagUpdate(TagBase):
    ...


# --- Tabs ---
class TabBase(BaseModel):
    name: str
    description: Optional[str] = None
    tag_id: Optional[int] = None  # можно указать тег для вкладки

class TabCreate(TabBase):
    pass

class TabRead(TabBase):
    id: int
    # name: str
    # description: Optional[str]
    # tag_id: Optional[int] = None
    box_count: Optional[int] = 0
    fields: List["TabFieldRead"] = []

    class Config:
        orm_mode = True

class TabUpdate(TabBase):
    ...
    # name: Optional[str]
    # tag_id: Optional[int]


# --- Tab fields ---
class TabFieldBase(BaseModel):
    name: str
    field_type: Optional[Any] = "string"
    required: Optional[bool] = False
    default_value: Optional[Any] = None
    allowed_values: Optional[List[Any] | Dict[str, Any]] = None
    
    class Config:
        orm_mode = True

class TabFieldCreate(TabFieldBase):
    tab_id: int

class TabFieldRead(TabFieldBase):
    name: str
    
class TabFieldUpdate(TabFieldBase):
    ...
    # name: Optional[str]
    # field_type: Optional[str]
    # required: Optional[bool]
    # default_value: Optional[str]
    # allowed_values: Optional[dict]  # <- список/словарь разрешённых значений

# --- Boxes ---
class BoxBase(BaseModel):
    name: str
    capacity: int = 10
    slot_count: int = 0
    tag_id: Optional[int] = None  # теперь можно указать тег

class BoxCreate(BoxBase):
    tab_id: int

class BoxRead(BoxBase):
    id: int
    tab_id: int
    items_count: int = 0
    # tag_id: Optional[int]

    class Config:
        orm_mode = True

class BoxUpdate(BoxBase):
    ...
    # name: Optional[str]
    # capacity: Optional[int]
    # slot_count: Optional[int]
    # tag_id: Optional[int]


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
    box_id: Optional[str]
    slot_id: Optional[int]

class ItemRead(ItemBase):
    id: int
    tab_id: int
    box_id: Optional[int]
    slot_id: Optional[int]
    # tag_id: Optional[int]

    class Config:
        orm_mode = True
        
class ItemUpdate(ItemBase):
    box_id: Optional[int]
    # name: Optional[str]
    # box_id: Optional[int]
    # tag_id: Optional[int]
    # slot_id: Optional[int]
    # position: Optional[int]
    # metadata_json: Optional[Dict[str, Any]]
