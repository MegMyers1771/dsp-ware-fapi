from pydantic import BaseModel, Field, constr
from typing import Optional, List, Dict, Any
from pydantic.config import ConfigDict
from datetime import datetime

UsernameStr = constr(
    strip_whitespace=True,
    min_length=3,
    max_length=50,
    pattern=r"^[A-Za-z0-9_-]+$",
)

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


# --- Statuses ---
class StatusBase(BaseModel):
    name: str
    color: Optional[str] = "#0d6efd"

class StatusCreate(StatusBase):
    pass

class StatusRead(StatusBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class StatusUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


# --- Issues ---
class IssueRead(BaseModel):
    id: int
    status_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ItemIssuePayload(BaseModel):
    status_id: int
    responsible_user_name: UsernameStr
    serial_number: Optional[str] = None
    invoice_number: Optional[str] = None


class ItemUtilizedRead(BaseModel):
    id: int
    issue_id: int
    item_snapshot: str
    responsible_user_name: Optional[str] = None
    serial_number: Optional[str] = None
    invoice_number: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class IssueHistoryEntry(BaseModel):
    id: int
    status_id: int
    status_name: str
    status_color: Optional[str] = None
    responsible_user_name: Optional[str] = None
    serial_number: Optional[str] = None
    invoice_number: Optional[str] = None
    item_snapshot: Dict[str, Any]
    created_at: datetime


# --- Users / Auth ---
class UserBase(BaseModel):
    user_name: UsernameStr


class UserCreate(UserBase):
    password: constr(min_length=6)
    role: Optional[str] = "viewer"


class UserRead(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


class LoginRequest(BaseModel):
    user_name: UsernameStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenWithUser(Token):
    user: UserRead


# --- Tabs ---
class TabBase(BaseModel):
    name: str
    description: Optional[str] = None
    tag_ids: List[int] = Field(default_factory=list)
    enable_pos: bool = True

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
    id: int
    tab_id: int
    stable_key: str
    
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
    name: constr(strip_whitespace=True, min_length=1)
    qty: int = Field(..., ge=1)
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


class ItemUpdate(BaseModel):
    name: Optional[constr(strip_whitespace=True, min_length=1)] = None
    qty: Optional[int] = Field(None, ge=1)
    position: Optional[int] = None
    metadata_json: Optional[Dict[str, Any]] = None
    tag_ids: Optional[List[int]] = None
    box_id: Optional[int]


class ItemReorderPayload(BaseModel):
    box_id: int
    ordered_ids: List[int] = Field(min_length=1)


# --- Parser / Imports ---
class ParsedTabSummary(BaseModel):
    name: str
    boxes_count: int
    items_count: int
    fields_count: int
    has_allowed_values: bool = False


class ParsedTabBoxDetail(BaseModel):
    name: str
    items: List[Dict[str, Any]] = Field(default_factory=list)


class ParsedTabDetail(BaseModel):
    name: str
    enable_pos: bool = True
    fields: List[str] = Field(default_factory=list)
    allowed_values: Dict[str, List[Any]] = Field(default_factory=dict)
    boxes: List[ParsedTabBoxDetail] = Field(default_factory=list)


class ParserConfigCreate(BaseModel):
    worksheet_name: str
    box_column: str
    fields: Dict[str, str]
    reserved_ranges: Dict[str, str] = Field(default_factory=dict)
    enable_pos: bool = True


class ParserConfigSummary(BaseModel):
    name: str
    worksheet_name: str
    box_column: str
    fields_count: int
    reserved_ranges_count: int
    enable_pos: bool
    parsed: bool
    parsed_boxes_count: Optional[int] = None
    parsed_items_count: Optional[int] = None
    parsed_has_allowed_values: bool = False
    parsed_file_name: str


class ParserConfigDetail(ParserConfigSummary):
    fields: Dict[str, str] = Field(default_factory=dict)
    reserved_ranges: Dict[str, str] = Field(default_factory=dict)


class ParserEnvInfo(BaseModel):
    spreadsheet_id: str
    credentials_path: str


class ParserEnvUpdate(BaseModel):
    spreadsheet_id: Optional[str] = None
    credentials_path: Optional[str] = None


class ParserCredentialsUpload(BaseModel):
    data: Dict[str, Any]
    path: Optional[str] = None


class ParserImportResult(BaseModel):
    tab_id: int
    fields_created: int
    boxes_created: int
    items_created: int


class ParserRunPayload(BaseModel):
    spreadsheet_id: str
    worksheet_name: str
    box_column: str
    fields: Dict[str, str]
    reserved_ranges: Dict[str, str]
    enable_pos: bool = True


class ParserRunResponse(BaseModel):
    worksheet_name: str
    file_name: str
    boxes_count: int
    items_count: int
    enable_pos: bool = True
