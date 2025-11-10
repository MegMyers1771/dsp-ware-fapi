from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from pydantic.config import ConfigDict

# --- Tags ---
class TagBase(BaseModel):
    name: str
    color: Optional[str] = "#cccccc"

class TagLinkPayload(BaseModel):
    tab_id: Optional[int] = None
    box_id: Optional[int] = None
    item_id: Optional[int] = None

class TagCreate(TagBase, TagLinkPayload):
    pass

class TagRead(TagBase, TagLinkPayload):
    id: int
    attached_tabs: List[int] = Field(default_factory=list)
    attached_boxes: List[int] = Field(default_factory=list)
    attached_items: List[int] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)

    # class Config:
    #     orm_mode = True
        
class TagUpdate(TagLinkPayload):
    name: Optional[str] = None
    color: Optional[str] = None


# --- Tabs ---
class TabBase(BaseModel):
    name: str
    description: Optional[str] = None
    tag_ids: List[int] = Field(default_factory=list)

class TabCreate(TabBase):
    pass

class TabRead(TabBase):
    id: int
    box_count: Optional[int] = 0
    fields: List["TabFieldRead"] = []
    model_config = ConfigDict(from_attributes=True)
    # class Config:
    #     orm_mode = True

class TabUpdate(TabBase):
    ...


# --- Tab fields ---
class TabFieldBase(BaseModel):
    name: str
    strong: bool = False  # если true, то значение должно быть из allowed_values
    allowed_values: Optional[List[Any] | Dict[str, str]] = None
    model_config = ConfigDict(from_attributes=True)
    # class Config:
    #     orm_mode = True

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
    description: Optional[str] = None
    tag_ids: List[int] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)

class BoxCreate(BoxBase):
    tab_id: int

class BoxRead(BoxBase):
    id: int
    tab_id: int
    items_count: int = 0
    model_config = ConfigDict(from_attributes=True)

class BoxUpdate(BoxBase):
    ...
    # name: Optional[str]


# --- Items ---
class ItemBase(BaseModel):
    name: str
    qty: int = 1
    position: Optional[int] = 1
    metadata_json: Dict[str, Any] = Field(default_factory=dict)
    tag_ids: List[int] = Field(default_factory=list)

class ItemCreate(ItemBase):
    tab_id: int
    box_id: Optional[int]

class ItemRead(ItemBase):
    id: int
    tab_id: int
    box_id: Optional[int]
    box_position: int

    model_config = ConfigDict(from_attributes=True)
        
class ItemUpdate(ItemBase):
    box_id: Optional[int]
    # name: Optional[str]
    # box_id: Optional[int]
    # position: Optional[int]
    # metadata_json: Optional[Dict[str, Any]]
